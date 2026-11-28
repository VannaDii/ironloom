//! Resumable model files under a configured shared root. No model is loaded here.
use crate::{
    factory::{DownloadProgress, DownloadProgressData, ModelSource, ModelSourceData},
    providers::AdapterError,
};
use ironloom_core::{ActorId, BoxFuture, Counter};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    path::{Component, Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Mutex, watch},
};

const PROGRESS_BYTES: u64 = 1024 * 1024;
const HASH_BUFFER_BYTES: usize = 128 * 1024;
const MAX_REDIRECTS: usize = 8;
/// One source-declared file at an immutable repository revision.
#[derive(Clone, Debug)]
pub struct DownloadFile {
    /// Safe repository-relative destination; never an arbitrary browser-selected path.
    pub path: String,
    /// Source-issued URL, with source credentials applied only on its own origin.
    pub url: url::Url,
    /// Expected byte count when published.
    pub bytes: Option<u64>,
    /// Published SHA-256 when available; otherwise a computed hash is retained honestly.
    pub sha256: Option<String>,
}
/// Official source metadata and credential-use callbacks.
pub trait FileCatalog: Send + Sync {
    /// Rechecks source access and returns files for exactly the selected revision.
    fn files<'a>(
        &'a self,
        source: &'a ModelSource,
    ) -> BoxFuture<'a, Result<Vec<DownloadFile>, AdapterError>>;
    /// Applies currently authorized source credentials, never automatic anonymous fallback.
    fn authorize(
        &self,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, AdapterError>>;
}
/// Service-owned PostgreSQL progress/inventory persistence and live authorization.
pub trait DownloadObserver: Send + Sync {
    /// Loads an existing authorized transfer; an unknown ID never creates a replacement.
    fn load(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
    /// Saves progress and emits a service notification before returning.
    fn progress(&self, value: DownloadProgress) -> BoxFuture<'_, Result<(), AdapterError>>;
    /// Saves verified local inventory/provenance, independently of project/worktree cleanup.
    fn verified(
        &self,
        source: ModelSource,
        files: Vec<VerifiedFile>,
    ) -> BoxFuture<'_, Result<(), AdapterError>>;
}
/// Verified file provenance; a computed digest is distinct from a publisher-provided digest.
#[derive(Clone, Debug)]
pub struct VerifiedFile {
    /// Model-root-relative file path.
    pub path: PathBuf,
    /// Actual installed byte count.
    pub bytes: u64,
    /// Actual SHA-256 of downloaded/imported bytes.
    pub sha256: String,
    /// True only when a supplied source digest matched.
    pub publisher_checksum: bool,
}
/// Execution boundary called by the source port after service authorization.
pub trait DownloadExecutor: Send + Sync {
    /// Runs one pinned transfer; a repeated active ID cannot open a second writer.
    fn transfer(
        &self,
        progress: DownloadProgress,
    ) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
    /// Waits for the owned HTTP/file writer to stop before confirming termination.
    fn cancel(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
}
struct Active {
    cancel: watch::Sender<bool>,
    finished: watch::Receiver<bool>,
}
/// Shared-root streaming downloader. Construction performs no download or model discovery.
pub struct FileDownloads {
    root: PathBuf,
    catalog: Arc<dyn FileCatalog>,
    observer: Arc<dyn DownloadObserver>,
    client: reqwest::Client,
    active: Mutex<BTreeMap<ActorId, Active>>,
}
impl FileDownloads {
    /// The service supplies an infrastructure-configured existing model root.
    pub fn new(
        root: PathBuf,
        catalog: Arc<dyn FileCatalog>,
        observer: Arc<dyn DownloadObserver>,
    ) -> Result<Self, AdapterError> {
        if !root.is_absolute() {
            return Err(AdapterError::Unsupported);
        }
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AdapterError::Unavailable)?;
        Ok(Self {
            root,
            catalog,
            observer,
            client,
            active: Mutex::default(),
        })
    }
    async fn destination(&self, source: &ModelSource, file: &str) -> Result<PathBuf, AdapterError> {
        safe_relative(file)?;
        let root = tokio::fs::canonicalize(&self.root)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        let identity = format!(
            "{}\0{}\0{}",
            source.host.as_str(),
            source.repository_url,
            source.revision.as_str()
        );
        let directory = root.join(hex::encode(Sha256::digest(identity.as_bytes())));
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        let target = directory.join(file);
        let parent = target.parent().ok_or(AdapterError::Unsupported)?;
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        let canonical = tokio::fs::canonicalize(parent)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if !canonical.starts_with(&root) {
            return Err(AdapterError::Unsupported);
        }
        for candidate in [
            &target,
            &target.with_extension(format!(
                "{}.part",
                target.extension().and_then(|s| s.to_str()).unwrap_or("")
            )),
        ] {
            if tokio::fs::symlink_metadata(candidate)
                .await
                .is_ok_and(|m| m.file_type().is_symlink())
            {
                return Err(AdapterError::Unsupported);
            }
        }
        Ok(target)
    }
    async fn response(
        &self,
        file: &DownloadFile,
        offset: u64,
    ) -> Result<reqwest::Response, AdapterError> {
        let original = file.url.clone();
        let mut url = original.clone();
        for hop in 0..=MAX_REDIRECTS {
            if !(url.scheme() == "https"
                || (url.origin() == original.origin()
                    && url.scheme() == "http"
                    && url.host_str().is_some_and(|h| {
                        h.parse::<std::net::IpAddr>()
                            .is_ok_and(|ip| ip.is_loopback())
                    })))
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err(AdapterError::Unsupported);
            }
            let request = self
                .client
                .get(url.clone())
                .header(reqwest::header::RANGE, format!("bytes={offset}-"));
            let request = if url.origin() == original.origin() {
                self.catalog.authorize(request).await?
            } else {
                request
            };
            let response = request
                .send()
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            if response.status().is_redirection() {
                if hop == MAX_REDIRECTS {
                    return Err(AdapterError::Unavailable);
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .and_then(|h| h.to_str().ok())
                    .ok_or(AdapterError::Unavailable)?;
                let next = url.join(location).map_err(|_| AdapterError::Unsupported)?;
                if next.origin() != original.origin()
                    && !official_download_host(next.host_str().unwrap_or(""))
                {
                    return Err(AdapterError::Unsupported);
                }
                url = next;
                continue;
            }
            return Ok(response);
        }
        Err(AdapterError::Unavailable)
    }
    async fn inner(
        &self,
        initial: DownloadProgress,
        mut cancel: watch::Receiver<bool>,
    ) -> Result<DownloadProgress, AdapterError> {
        let files = self.catalog.files(&initial.source).await?;
        if files.is_empty() {
            return Err(AdapterError::Unavailable);
        }
        let mut progress = initial;
        let mut installed = Vec::new();
        let mut received = 0_u64;
        let total = files
            .iter()
            .try_fold(0_u64, |sum, file| sum.checked_add(file.bytes?));
        for file in files {
            if *cancel.borrow() {
                return self.stopped(progress).await;
            }
            let target = self.destination(&progress.source, &file.path).await?;
            if let Ok(metadata) = tokio::fs::metadata(&target).await {
                // Existing complete bytes are reused only when the source supplied a matching digest.
                if file.bytes == Some(metadata.len()) && file.sha256.is_some() {
                    let hash = hash(&target).await?;
                    if file
                        .sha256
                        .as_ref()
                        .is_some_and(|expected| expected.eq_ignore_ascii_case(&hash))
                    {
                        received = received
                            .checked_add(metadata.len())
                            .ok_or(AdapterError::Unavailable)?;
                        installed.push(VerifiedFile {
                            path: target
                                .strip_prefix(&self.root)
                                .map_err(|_| AdapterError::Unsupported)?
                                .into(),
                            bytes: metadata.len(),
                            sha256: hash,
                            publisher_checksum: true,
                        });
                        continue;
                    }
                }
            }
            let part = target.with_extension(format!(
                "{}.part",
                target.extension().and_then(|s| s.to_str()).unwrap_or("")
            ));
            let offset = tokio::fs::metadata(&part)
                .await
                .map(|m| m.len())
                .unwrap_or(0);
            let mut response = tokio::select! {_ = cancel.changed()=>return self.stopped(progress).await,result=self.response(&file,offset)=>result?};
            let append = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
            if !response.status().is_success() {
                return Err(AdapterError::Unavailable);
            }
            if append {
                let range = response
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                    .ok_or(AdapterError::Unavailable)?;
                if !range.starts_with(&format!("bytes {offset}-")) {
                    return Err(AdapterError::Unavailable);
                }
            }
            let mut output = tokio::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .append(append)
                .truncate(!append)
                .open(&part)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            let mut written = if append { offset } else { 0 };
            let mut reported = written;
            loop {
                let chunk = tokio::select! {_ = cancel.changed()=>{output.sync_all().await.map_err(|_|AdapterError::Unavailable)?;progress=update(&progress,received.checked_add(written).ok_or(AdapterError::Unavailable)?,total,false,false,None)?;return self.stopped(progress).await;},result=tokio::time::timeout(Duration::from_secs(60),response.chunk())=>result.map_err(|_|AdapterError::Interrupted)?.map_err(|_|AdapterError::Interrupted)?};
                let Some(chunk) = chunk else { break };
                written = written
                    .checked_add(chunk.len() as u64)
                    .ok_or(AdapterError::Unavailable)?;
                if file.bytes.is_some_and(|limit| written > limit) {
                    return Err(AdapterError::Interrupted);
                }
                output
                    .write_all(&chunk)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?;
                if written.saturating_sub(reported) >= PROGRESS_BYTES {
                    progress = update(&progress, received + written, total, false, false, None)?;
                    self.observer.progress(progress.clone()).await?;
                    reported = written;
                }
            }
            output
                .sync_all()
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            drop(output);
            if file.bytes.is_some_and(|expected| written != expected) {
                return Err(AdapterError::Interrupted);
            }
            let digest = hash(&part).await?;
            if file
                .sha256
                .as_ref()
                .is_some_and(|expected| !expected.eq_ignore_ascii_case(&digest))
            {
                return Err(AdapterError::Interrupted);
            }
            tokio::fs::rename(&part, &target)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            received = received
                .checked_add(written)
                .ok_or(AdapterError::Unavailable)?;
            installed.push(VerifiedFile {
                path: target
                    .strip_prefix(&self.root)
                    .map_err(|_| AdapterError::Unsupported)?
                    .into(),
                bytes: written,
                sha256: digest,
                publisher_checksum: file.sha256.is_some(),
            });
            progress = update(&progress, received, total, false, false, None)?;
            self.observer.progress(progress.clone()).await?;
        }
        // Stable manifest hash includes file identities and actual hashes, not a repository revision.
        installed.sort_by(|a, b| a.path.cmp(&b.path));
        let mut manifest = Sha256::new();
        for file in &installed {
            manifest.update(file.path.to_string_lossy().as_bytes());
            manifest.update([0]);
            manifest.update(file.sha256.as_bytes());
            manifest.update([0]);
        }
        let manifest = hex::encode(manifest.finalize());
        progress = update(
            &progress,
            received,
            Some(received),
            false,
            true,
            Some(manifest),
        )?;
        self.observer
            .verified(progress.source.clone(), installed)
            .await?;
        self.observer.progress(progress.clone()).await?;
        Ok(progress)
    }
    async fn stopped(&self, progress: DownloadProgress) -> Result<DownloadProgress, AdapterError> {
        let result = update(
            &progress,
            progress.received_bytes.get(),
            progress.total_bytes.map(Counter::get),
            true,
            true,
            None,
        )?;
        self.observer.progress(result.clone()).await?;
        Ok(result)
    }
}
impl DownloadExecutor for FileDownloads {
    fn transfer(
        &self,
        progress: DownloadProgress,
    ) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        Box::pin(async move {
            let (cancel, receiver) = watch::channel(false);
            let (finished, done) = watch::channel(false);
            {
                let mut active = self.active.lock().await;
                if active.contains_key(&progress.download_id) {
                    return Err(AdapterError::Unavailable);
                }
                active.insert(
                    progress.download_id.clone(),
                    Active {
                        cancel,
                        finished: done,
                    },
                );
            }
            let result = self.inner(progress.clone(), receiver).await;
            self.active.lock().await.remove(&progress.download_id);
            let _ = finished.send(true);
            result
        })
    }
    fn cancel(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        Box::pin(async move {
            let mut finished = {
                let active = self.active.lock().await;
                if let Some(job) = active.get(&id) {
                    let _ = job.cancel.send(true);
                    Some(job.finished.clone())
                } else {
                    None
                }
            };
            if let Some(done) = finished.as_mut() {
                while !*done.borrow() {
                    if done.changed().await.is_err() {
                        break;
                    }
                }
            }
            self.stopped(self.observer.load(id).await?).await
        })
    }
}
fn update(
    progress: &DownloadProgress,
    received: u64,
    total: Option<u64>,
    cancel: bool,
    terminated: bool,
    manifest: Option<String>,
) -> Result<DownloadProgress, AdapterError> {
    let source = if let Some(hash) = manifest {
        ModelSource::new(ModelSourceData {
            checksum: Some(ActorId::new(hash).map_err(|_| AdapterError::Unavailable)?),
            ..(*progress.source).clone()
        })
        .map_err(|_| AdapterError::Unavailable)?
    } else {
        progress.source.clone()
    };
    DownloadProgress::new(DownloadProgressData {
        source,
        received_bytes: Counter::new(received),
        total_bytes: total.map(Counter::new),
        cancel_requested: cancel,
        terminated,
        ..(**progress).clone()
    })
    .map_err(|_| AdapterError::Unavailable)
}
fn safe_relative(path: &str) -> Result<(), AdapterError> {
    if path.is_empty()
        || Path::new(path)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(AdapterError::Unsupported);
    }
    Ok(())
}
async fn hash(path: &Path) -> Result<String, AdapterError> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|_| AdapterError::Unavailable)?;
    let mut hash = Sha256::new();
    let mut buffer = vec![0; HASH_BUFFER_BYTES];
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(hex::encode(hash.finalize()))
}
fn official_download_host(host: &str) -> bool {
    host == "storage.googleapis.com"
        || host == "kaggle-production-data.s3.amazonaws.com"
        || [
            ".huggingface.co",
            ".hf.co",
            ".modelscope.cn",
            ".modelscope.net",
            ".aliyuncs.com",
            ".googleusercontent.com",
            ".kaggleusercontent.com",
        ]
        .iter()
        .any(|suffix| host.ends_with(suffix))
}

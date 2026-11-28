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
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{oneshot, watch},
};

const PROGRESS_BYTES: u64 = 1024 * 1024;
const HASH_BUFFER_BYTES: usize = 128 * 1024;
const MAX_REDIRECTS: usize = 8;
const CANCEL_POLL: Duration = Duration::from_millis(100);
const CANCEL_WAIT: Duration = Duration::from_secs(5);
/// Source-declared transfer representation; never guessed from a browser filename.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DownloadFormat {
    /// One regular repository file.
    File,
    /// Current tar/gzip model bundle, requiring bounded verified extraction before installation.
    TarGzip,
}
/// Reserved compressed transfer cache for a single current bundle; it is not runnable inventory.
pub const ARCHIVE_FILE: &str = ".source-bundle.tar.gz";
/// One source-declared file at an immutable repository revision.
#[derive(Clone, Debug)]
pub struct DownloadFile {
    /// Actual source representation; archive bytes alone cannot establish installation.
    pub format: DownloadFormat,
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
/// Each instance is bound to its attempt's immutable node/root/writer-generation fence; looking up
/// a newer current writer must never authorize a stale callback. All mutations enforce that fence.
pub trait DownloadObserver: Send + Sync {
    /// Loads an existing authorized transfer fenced to this configured writer node/model root.
    /// Other-root ownership must be routed to its owner or rejected, never interpreted as stopped.
    /// An unknown ID never creates a replacement.
    fn load(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
    /// Atomically merges progress and emits a notification. A writer update must preserve an
    /// already requested cancellation and cancellation-only updates must preserve newer bytes.
    fn progress(&self, value: DownloadProgress) -> BoxFuture<'_, Result<(), AdapterError>>;
    /// Fenced reset of this writer's unverified transfer and source checkpoints before removing
    /// an invalid reserved archive cache. Recheck current node/root/writer and grants; reject any
    /// already verified installation. Preserve exact download/repository/source identity and any
    /// cancellation request, clear unverified byte/total/checkpoint state, and retain live ownership.
    /// This is an internal recovery operation, never permission to delete a verified model.
    fn reset(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>>;
    /// Reads the checkpoint for this exact source/revision/model-root-relative path.
    fn file_checkpoint<'a>(
        &'a self,
        source: &'a ModelSource,
        path: &'a Path,
    ) -> BoxFuture<'a, Result<Option<VerifiedFile>, AdapterError>>;
    /// Persists the verified staged digest before rename, independently of final inventory.
    /// Computed hashes must remain distinct from publisher-verified hashes.
    fn checkpoint_file(
        &self,
        source: ModelSource,
        file: VerifiedFile,
    ) -> BoxFuture<'_, Result<(), AdapterError>>;
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
/// Required infrastructure limits, independent of optional publisher metadata.
#[derive(Clone, Copy)]
pub struct DownloadLimits {
    /// Maximum bytes in any one downloaded file, including retained partial data.
    pub per_file_bytes: u64,
    /// Maximum aggregate bytes in a pinned transfer, including reused files.
    pub transfer_bytes: u64,
}
struct ActiveGuard {
    active: Arc<Mutex<BTreeMap<ActorId, Active>>>,
    id: ActorId,
    finished: watch::Sender<bool>,
}
impl Drop for ActiveGuard {
    fn drop(&mut self) {
        self.active
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.id);
        let _ = self.finished.send(true);
    }
}
/// Shared-root streaming downloader. Construction performs no download or model discovery.
#[derive(Clone)]
pub struct FileDownloads {
    root: PathBuf,
    catalog: Arc<dyn FileCatalog>,
    observer: Arc<dyn DownloadObserver>,
    client: reqwest::Client,
    active: Arc<Mutex<BTreeMap<ActorId, Active>>>,
    limits: DownloadLimits,
}
impl FileDownloads {
    /// The service supplies an infrastructure-configured existing model root.
    pub fn new(
        root: PathBuf,
        catalog: Arc<dyn FileCatalog>,
        observer: Arc<dyn DownloadObserver>,
        limits: DownloadLimits,
    ) -> Result<Self, AdapterError> {
        if !root.is_absolute() || limits.per_file_bytes == 0 || limits.transfer_bytes == 0 {
            return Err(AdapterError::Unsupported);
        }
        let root = std::fs::canonicalize(root).map_err(|_| AdapterError::Unavailable)?;
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
            active: Arc::default(),
            limits,
        })
    }
    async fn destination(&self, source: &ModelSource, file: &str) -> Result<PathBuf, AdapterError> {
        safe_relative(file)?;
        let root = tokio::fs::canonicalize(&self.root)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        let directory = root.join(source_key(source));
        ensure_directory(&root, &directory).await?;
        let target = directory.join(file);
        let parent = target.parent().ok_or(AdapterError::Unsupported)?;
        ensure_directory(&root, parent).await?;
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
        if *cancel.borrow() || initial.cancel_requested {
            return self.stopped(initial).await;
        }
        // Advisory OS file locking coordinates cooperating processes/instances sharing this root,
        // including distinct IDs and adapter objects. Never unlink a lock file while it may be held.
        let _lock = self.source_lock(&initial.source)?;
        let files = self.catalog.files(&initial.source).await?;
        if files.is_empty() {
            return Err(AdapterError::Unavailable);
        }
        if files
            .iter()
            .any(|file| file.format == DownloadFormat::TarGzip)
            && (files.len() != 1 || files[0].path != ARCHIVE_FILE)
        {
            return Err(AdapterError::Unsupported);
        }
        let bundle = files
            .first()
            .is_some_and(|file| file.format == DownloadFormat::TarGzip);
        let mut progress = initial;
        let mut installed = Vec::new();
        let mut received = 0_u64;
        let total = files
            .iter()
            .try_fold(0_u64, |sum, file| sum.checked_add(file.bytes?));
        if total.is_some_and(|n| n > self.limits.transfer_bytes)
            || files
                .iter()
                .any(|f| f.bytes.is_some_and(|n| n > self.limits.per_file_bytes))
        {
            return Err(AdapterError::Unsupported);
        }
        for file in files {
            if *cancel.borrow() {
                return self.stopped(progress).await;
            }
            let target = self.destination(&progress.source, &file.path).await?;
            if let Ok(metadata) = tokio::fs::metadata(&target).await {
                let relative = target
                    .strip_prefix(&self.root)
                    .map_err(|_| AdapterError::Unsupported)?;
                let checkpoint = self
                    .observer
                    .file_checkpoint(&progress.source, relative)
                    .await?;
                let expected = file
                    .sha256
                    .as_deref()
                    .or(checkpoint.as_ref().map(|v| v.sha256.as_str()));
                let length_matches = file.bytes.is_none_or(|n| n == metadata.len())
                    && checkpoint
                        .as_ref()
                        .is_none_or(|v| v.bytes == metadata.len());
                if length_matches && let Some(expected) = expected {
                    let digest = hash(&target).await?;
                    if expected.eq_ignore_ascii_case(&digest) {
                        checked_bytes(0, metadata.len(), self.limits.per_file_bytes)?;
                        received =
                            checked_bytes(received, metadata.len(), self.limits.transfer_bytes)?;
                        installed.push(verified(
                            &self.root,
                            &target,
                            metadata.len(),
                            digest,
                            file.sha256.is_some()
                                || checkpoint.is_some_and(|v| v.publisher_checksum),
                        )?);
                        continue;
                    }
                }
                if bundle {
                    self.discard_archive(&progress, &target).await?;
                }
                return Err(AdapterError::Unsupported);
            }
            let part = target.with_extension(format!(
                "{}.part",
                target.extension().and_then(|s| s.to_str()).unwrap_or("")
            ));
            let mut offset = tokio::fs::metadata(&part)
                .await
                .map(|m| m.len())
                .unwrap_or(0);
            if offset > self.limits.per_file_bytes
                || file.bytes.is_some_and(|n| offset > n)
                || received
                    .checked_add(offset)
                    .is_none_or(|n| n > self.limits.transfer_bytes)
            {
                tokio::fs::remove_file(&part)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?;
                offset = 0;
            }
            let mut complete = offset > 0 && file.bytes == Some(offset);
            if complete
                && let Some(expected) = &file.sha256
                && !expected.eq_ignore_ascii_case(&hash(&part).await?)
            {
                tokio::fs::remove_file(&part)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?;
                offset = 0;
                complete = false;
            }
            let mut written = offset;
            if !complete {
                let mut response = tokio::select! {reason = self.wait_cancel(&mut cancel, &progress.download_id)=>{reason?;return self.stopped(progress).await;},result=self.response(&file,offset)=>result?};
                if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                    let total = response
                        .headers()
                        .get(reqwest::header::CONTENT_RANGE)
                        .and_then(|h| h.to_str().ok())
                        .and_then(|s| s.strip_prefix("bytes */"))
                        .and_then(|s| s.parse::<u64>().ok());
                    if offset > 0 && total == Some(offset) && file.bytes.is_none_or(|n| n == offset)
                    {
                        complete = true;
                    } else {
                        if offset > 0 {
                            tokio::fs::remove_file(&part)
                                .await
                                .map_err(|_| AdapterError::Unavailable)?;
                        }
                        offset = 0;
                        written = 0;
                        response = tokio::select! {reason = self.wait_cancel(&mut cancel, &progress.download_id)=>{reason?;return self.stopped(progress).await;},result=self.response(&file,0)=>result?};
                    }
                }
                if !complete {
                    let append = response.status() == reqwest::StatusCode::PARTIAL_CONTENT;
                    if !response.status().is_success() {
                        return Err(AdapterError::Unavailable);
                    }
                    let range = if append {
                        let value = response
                            .headers()
                            .get(reqwest::header::CONTENT_RANGE)
                            .and_then(|v| v.to_str().ok())
                            .ok_or(AdapterError::Unavailable)?;
                        let range = parse_range(value)?;
                        if range.start != offset
                            || file
                                .bytes
                                .zip(range.total)
                                .is_some_and(|(declared, total)| declared != total)
                        {
                            return Err(AdapterError::Interrupted);
                        }
                        let bound = range
                            .total
                            .unwrap_or(range.end.checked_add(1).ok_or(AdapterError::Interrupted)?);
                        checked_bytes(0, bound, self.limits.per_file_bytes)?;
                        checked_bytes(received, bound, self.limits.transfer_bytes)?;
                        Some(range)
                    } else {
                        None
                    };
                    let mut output = tokio::fs::OpenOptions::new()
                        .create(true)
                        .write(true)
                        .append(append)
                        .truncate(!append)
                        .open(&part)
                        .await
                        .map_err(|_| AdapterError::Unavailable)?;
                    written = if append { offset } else { 0 };
                    let mut reported = written;
                    let cancellation_id = progress.download_id.clone();
                    let cancellation = self.wait_cancel(&mut cancel, &cancellation_id);
                    tokio::pin!(cancellation);
                    loop {
                        let chunk = tokio::select! {
                            reason = &mut cancellation=>{reason?;output.sync_all().await.map_err(|_|AdapterError::Unavailable)?;progress=update(&progress,checked_bytes(received,written,self.limits.transfer_bytes)?,total,false,false,None)?;return self.stopped(progress).await;},
                            result=tokio::time::timeout(Duration::from_secs(60),response.chunk())=>result.map_err(|_|AdapterError::Interrupted)?.map_err(|_|AdapterError::Interrupted)?
                        };
                        let Some(chunk) = chunk else { break };
                        written =
                            checked_bytes(written, chunk.len() as u64, self.limits.per_file_bytes)?;
                        checked_bytes(received, written, self.limits.transfer_bytes)?;
                        if range.as_ref().is_some_and(|r| written > r.end + 1) {
                            return Err(AdapterError::Interrupted);
                        }
                        if file.bytes.is_some_and(|n| written > n) {
                            return Err(AdapterError::Interrupted);
                        }
                        output
                            .write_all(&chunk)
                            .await
                            .map_err(|_| AdapterError::Unavailable)?;
                        if written.saturating_sub(reported) >= PROGRESS_BYTES {
                            progress = update(
                                &progress,
                                checked_bytes(received, written, self.limits.transfer_bytes)?,
                                total,
                                false,
                                false,
                                None,
                            )?;
                            self.observer.progress(progress.clone()).await?;
                            reported = written;
                        }
                    }
                    output
                        .sync_all()
                        .await
                        .map_err(|_| AdapterError::Unavailable)?;
                    drop(output);
                    if let Some(range) = range {
                        let end = range.end.checked_add(1).ok_or(AdapterError::Interrupted)?;
                        if written != end || range.total.is_none_or(|total| written != total) {
                            progress = update(
                                &progress,
                                checked_bytes(received, written, self.limits.transfer_bytes)?,
                                range.total.and_then(|n| received.checked_add(n)),
                                false,
                                false,
                                None,
                            )?;
                            self.observer.progress(progress).await?;
                            return Err(AdapterError::Interrupted);
                        }
                    }
                }
            }
            if file.bytes.is_some_and(|n| written != n) {
                return Err(AdapterError::Interrupted);
            }
            let digest = hash(&part).await?;
            let checkpoint = self
                .observer
                .file_checkpoint(
                    &progress.source,
                    target
                        .strip_prefix(&self.root)
                        .map_err(|_| AdapterError::Unsupported)?,
                )
                .await?;
            let expected = file
                .sha256
                .as_deref()
                .or(checkpoint.as_ref().map(|value| value.sha256.as_str()));
            if expected.is_some_and(|expected| !expected.eq_ignore_ascii_case(&digest)) {
                tokio::fs::remove_file(&part)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?;
                return Err(AdapterError::Interrupted);
            }
            let publisher_checksum = file.sha256.is_some()
                || checkpoint
                    .as_ref()
                    .is_some_and(|value| value.publisher_checksum);
            self.observer
                .checkpoint_file(
                    progress.source.clone(),
                    verified(
                        &self.root,
                        &target,
                        written,
                        digest.clone(),
                        publisher_checksum,
                    )?,
                )
                .await?;
            tokio::fs::rename(&part, &target)
                .await
                .map_err(|_| AdapterError::Unavailable)?;
            received = checked_bytes(received, written, self.limits.transfer_bytes)?;
            installed.push(verified(
                &self.root,
                &target,
                written,
                digest,
                publisher_checksum,
            )?);
            progress = update(&progress, received, total, false, false, None)?;
            self.observer.progress(progress.clone()).await?;
        }
        if bundle {
            let archive = self.destination(&progress.source, ARCHIVE_FILE).await?;
            let directory = archive
                .parent()
                .ok_or(AdapterError::Unsupported)?
                .to_path_buf();
            let staged = {
                let (signal, token) = watch::channel(*cancel.borrow());
                let extraction = super::archive::extract(
                    archive.clone(),
                    directory,
                    self.limits,
                    received,
                    token,
                    _lock.try_clone().map_err(|_| AdapterError::Unavailable)?,
                );
                tokio::pin!(extraction);
                let cancellation_id = progress.download_id.clone();
                let cancellation = self.wait_cancel(&mut cancel, &cancellation_id);
                tokio::pin!(cancellation);
                let result = tokio::select! {
                    result=&mut extraction=>result,
                    reason=&mut cancellation=>{let _=signal.send(true);let _=extraction.await;reason?;return self.stopped(progress).await;}
                };
                match result {
                    Ok(staged) => staged,
                    Err(error) => {
                        if error == AdapterError::Unsupported {
                            self.discard_archive(&progress, &archive).await?;
                        }
                        return Err(error);
                    }
                }
            };
            for file in &staged.files {
                if *cancel.borrow()
                    || self
                        .observer
                        .load(progress.download_id.clone())
                        .await?
                        .cancel_requested
                {
                    return self.stopped(progress).await;
                }
                if file.path == Path::new(ARCHIVE_FILE) {
                    return Err(AdapterError::Unsupported);
                }
                let target = self
                    .destination(
                        &progress.source,
                        file.path.to_str().ok_or(AdapterError::Unsupported)?,
                    )
                    .await?;
                if tokio::fs::try_exists(&target)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?
                {
                    if hash(&target).await? != file.sha256 {
                        return Err(AdapterError::Unsupported);
                    }
                } else {
                    // Persist the computed staged digest before publication; interrupted retries
                    // can verify the same source bytes without attributing a publisher checksum.
                    let verified =
                        verified(&self.root, &target, file.bytes, file.sha256.clone(), false)?;
                    self.observer
                        .checkpoint_file(progress.source.clone(), verified)
                        .await?;
                    tokio::fs::rename(staged.directory.path().join(&file.path), &target)
                        .await
                        .map_err(|_| AdapterError::Unavailable)?;
                }
                installed.push(verified(
                    &self.root,
                    &target,
                    file.bytes,
                    file.sha256.clone(),
                    false,
                )?);
            }
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
    async fn discard_archive(
        &self,
        current: &DownloadProgress,
        path: &Path,
    ) -> Result<(), AdapterError> {
        if path != self.destination(&current.source, ARCHIVE_FILE).await? {
            return Err(AdapterError::Unsupported);
        }
        let reset = self.observer.reset(current.download_id.clone()).await?;
        if reset.download_id != current.download_id
            || reset.repository_id != current.repository_id
            || source_key(&reset.source) != source_key(&current.source)
            || reset.received_bytes.get() != 0
            || reset.total_bytes.is_some()
            || reset.terminated
            || current.cancel_requested && !reset.cancel_requested
        {
            return Err(AdapterError::Unavailable);
        }
        match tokio::fs::remove_file(path).await {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(_) => Err(AdapterError::Unavailable),
        }
    }
    fn source_lock(&self, source: &ModelSource) -> Result<std::fs::File, AdapterError> {
        let path = self.root.join(format!(".{}.lock", source_key(source)));
        if std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_symlink()) {
            return Err(AdapterError::Unsupported);
        }
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)
            .map_err(|_| AdapterError::Unavailable)?;
        lock.try_lock().map_err(|_| AdapterError::Unavailable)?;
        Ok(lock)
    }
    async fn wait_cancel(
        &self,
        token: &mut watch::Receiver<bool>,
        id: &ActorId,
    ) -> Result<(), AdapterError> {
        loop {
            if *token.borrow() || self.observer.load(id.clone()).await?.cancel_requested {
                return Ok(());
            }
            tokio::select! {_ = token.changed()=>return Ok(()),_ = tokio::time::sleep(CANCEL_POLL)=>{}}
        }
    }
    async fn cancelled(
        &self,
        progress: DownloadProgress,
    ) -> Result<DownloadProgress, AdapterError> {
        let value = update(
            &progress,
            progress.received_bytes.get(),
            progress.total_bytes.map(Counter::get),
            true,
            true,
            None,
        )?;
        self.observer.progress(value.clone()).await?;
        Ok(value)
    }
    async fn stopped(&self, progress: DownloadProgress) -> Result<DownloadProgress, AdapterError> {
        let result = update(
            &progress,
            progress.received_bytes.get(),
            progress.total_bytes.map(Counter::get),
            true,
            false,
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
            let job = self.clone();
            let (result, receiver) = oneshot::channel();
            // The service-owned writer outlives an abandoned HTTP/caller future. Explicit cancel
            // still waits for its actual file/HTTP writer; RAII cleanup also covers task unwinding.
            let (cancel, token) = watch::channel(false);
            let (finished, done) = watch::channel(false);
            {
                let mut active = job.active.lock().unwrap_or_else(|e| e.into_inner());
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
            let guard = ActiveGuard {
                active: job.active.clone(),
                id: progress.download_id.clone(),
                finished,
            };
            tokio::spawn(async move {
                let outcome = job.inner(progress, token).await;
                let outcome = match outcome {
                    Ok(value) if value.cancel_requested && !value.terminated => {
                        job.cancelled(value).await
                    }
                    value => value,
                };
                drop(guard);
                let _ = result.send(outcome);
            });
            receiver.await.map_err(|_| AdapterError::Interrupted)?
        })
    }

    fn cancel(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        Box::pin(async move {
            let current = self.observer.load(id.clone()).await?;
            if current.terminated {
                return Ok(current);
            }
            let requested = self.stopped(current).await?;
            let mut finished = {
                let active = self.active.lock().unwrap_or_else(|e| e.into_inner());
                active.get(&id).map(|job| {
                    let _ = job.cancel.send(true);
                    job.finished.clone()
                })
            };
            if let Some(done) = finished.as_mut() {
                let _ = tokio::time::timeout(CANCEL_WAIT, async {
                    while !*done.borrow() {
                        if done.changed().await.is_err() {
                            break;
                        }
                    }
                })
                .await;
            }
            let deadline = tokio::time::Instant::now() + CANCEL_WAIT;
            loop {
                if let Ok(lock) = self.source_lock(&requested.source) {
                    drop(lock);
                    let value = self.observer.load(id.clone()).await?;
                    return if value.terminated {
                        Ok(value)
                    } else {
                        self.cancelled(value).await
                    };
                }
                if tokio::time::Instant::now() >= deadline {
                    return self.observer.load(id).await;
                }
                tokio::time::sleep(CANCEL_POLL).await;
            }
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
            .any(|part| !matches!(part, Component::Normal(name) if name != ".ironloom" && name != ".git"))
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

fn source_key(source: &ModelSource) -> String {
    hex::encode(Sha256::digest(
        format!(
            "{}\0{}\0{}",
            source.host.as_str(),
            source.repository_url,
            source.revision.as_str()
        )
        .as_bytes(),
    ))
}
fn checked_bytes(base: u64, additional: u64, limit: u64) -> Result<u64, AdapterError> {
    base.checked_add(additional)
        .filter(|n| *n <= limit)
        .ok_or(AdapterError::Interrupted)
}
fn verified(
    root: &Path,
    target: &Path,
    bytes: u64,
    sha256: String,
    publisher_checksum: bool,
) -> Result<VerifiedFile, AdapterError> {
    Ok(VerifiedFile {
        path: target
            .strip_prefix(root)
            .map_err(|_| AdapterError::Unsupported)?
            .into(),
        bytes,
        sha256,
        publisher_checksum,
    })
}
async fn ensure_directory(root: &Path, target: &Path) -> Result<(), AdapterError> {
    let relative = target
        .strip_prefix(root)
        .map_err(|_| AdapterError::Unsupported)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(AdapterError::Unsupported);
        }
        current.push(component);
        match tokio::fs::create_dir(&current).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err(AdapterError::Unavailable),
        }
        let meta = tokio::fs::symlink_metadata(&current)
            .await
            .map_err(|_| AdapterError::Unavailable)?;
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return Err(AdapterError::Unsupported);
        }
    }
    Ok(())
}

struct ByteRange {
    start: u64,
    end: u64,
    total: Option<u64>,
}
fn parse_range(value: &str) -> Result<ByteRange, AdapterError> {
    let (span, total) = value
        .strip_prefix("bytes ")
        .and_then(|v| v.split_once('/'))
        .ok_or(AdapterError::Interrupted)?;
    let (start, end) = span.split_once('-').ok_or(AdapterError::Interrupted)?;
    if start.is_empty()
        || end.is_empty()
        || !start.bytes().all(|v| v.is_ascii_digit())
        || !end.bytes().all(|v| v.is_ascii_digit())
        || (total != "*" && (total.is_empty() || !total.bytes().all(|v| v.is_ascii_digit())))
    {
        return Err(AdapterError::Interrupted);
    }
    let start = start
        .parse::<u64>()
        .map_err(|_| AdapterError::Interrupted)?;
    let end = end.parse::<u64>().map_err(|_| AdapterError::Interrupted)?;
    let total = if total == "*" {
        None
    } else {
        Some(
            total
                .parse::<u64>()
                .map_err(|_| AdapterError::Interrupted)?,
        )
    };
    if start > end || end == u64::MAX || total.is_some_and(|n| n == 0 || end >= n) {
        return Err(AdapterError::Interrupted);
    }
    Ok(ByteRange { start, end, total })
}

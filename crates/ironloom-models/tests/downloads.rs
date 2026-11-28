use ironloom_core::{ActorId, BoxFuture, validation::decode};
use ironloom_models::{
    factory::{DownloadProgress, ModelSource},
    providers::AdapterError,
    sources::downloads::{
        DownloadExecutor, DownloadFile, DownloadFormat, DownloadLimits, DownloadObserver,
        FileCatalog, FileDownloads, VerifiedFile,
    },
};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::{
    path::Path,
    sync::{Arc, Mutex},
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::{Notify, oneshot},
};
struct Catalog(DownloadFile);
impl FileCatalog for Catalog {
    fn files<'a>(
        &'a self,
        _: &'a ModelSource,
    ) -> BoxFuture<'a, Result<Vec<DownloadFile>, AdapterError>> {
        Box::pin(async { Ok(vec![self.0.clone()]) })
    }
    fn authorize(
        &self,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, AdapterError>> {
        Box::pin(async { Ok(request) })
    }
}
struct Observer {
    progress: Mutex<DownloadProgress>,
    verified: Mutex<usize>,
    verification_failures: std::sync::atomic::AtomicUsize,
    reset_failures: std::sync::atomic::AtomicUsize,
    done: Notify,
    load_delay_ms: std::sync::atomic::AtomicU64,
    checkpoints: Mutex<std::collections::BTreeMap<std::path::PathBuf, VerifiedFile>>,
}
impl DownloadObserver for Observer {
    fn load(&self, _: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        Box::pin(async {
            tokio::time::sleep(std::time::Duration::from_millis(
                self.load_delay_ms
                    .load(std::sync::atomic::Ordering::Relaxed),
            ))
            .await;
            Ok(self.progress.lock().unwrap().clone())
        })
    }
    fn progress(&self, value: DownloadProgress) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            let mut current = self.progress.lock().unwrap();
            let mut data = (*value).clone();
            data.cancel_requested |= current.cancel_requested;
            if current.received_bytes > data.received_bytes {
                data.received_bytes = current.received_bytes;
            }
            *current = DownloadProgress::new(data).unwrap();
            Ok(())
        })
    }
    fn reset(&self, id: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        Box::pin(async move {
            if self
                .reset_failures
                .fetch_update(
                    std::sync::atomic::Ordering::SeqCst,
                    std::sync::atomic::Ordering::SeqCst,
                    |count| count.checked_sub(1),
                )
                .is_ok()
            {
                return Err(AdapterError::Unavailable);
            }
            if *self.verified.lock().unwrap() > 0 {
                return Err(AdapterError::Unavailable);
            }
            let mut current = self.progress.lock().unwrap();
            if current.download_id != id {
                return Err(AdapterError::Unavailable);
            }
            let mut data = (**current).clone();
            data.received_bytes = ironloom_core::Counter::new(0);
            data.total_bytes = None;
            data.terminated = false;
            let next = DownloadProgress::new(data).unwrap();
            *current = next.clone();
            self.checkpoints.lock().unwrap().clear();
            Ok(next)
        })
    }
    fn file_checkpoint<'a>(
        &'a self,
        _: &'a ModelSource,
        path: &'a Path,
    ) -> BoxFuture<'a, Result<Option<VerifiedFile>, AdapterError>> {
        Box::pin(async move { Ok(self.checkpoints.lock().unwrap().get(path).cloned()) })
    }
    fn checkpoint_file(
        &self,
        _: ModelSource,
        file: VerifiedFile,
    ) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            self.checkpoints
                .lock()
                .unwrap()
                .insert(file.path.clone(), file);
            Ok(())
        })
    }
    fn verified(
        &self,
        _: ModelSource,
        files: Vec<VerifiedFile>,
    ) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            if self
                .verification_failures
                .fetch_update(
                    std::sync::atomic::Ordering::SeqCst,
                    std::sync::atomic::Ordering::SeqCst,
                    |count| count.checked_sub(1),
                )
                .is_ok()
            {
                return Err(AdapterError::Unavailable);
            }
            assert!(!files.is_empty());
            *self.verified.lock().unwrap() += 1;
            self.done.notify_one();
            Ok(())
        })
    }
}
fn progress(id: &str) -> DownloadProgress {
    decode(&serde_json::to_vec(&json!({"repository_id":"huggingface:publisher/model","download_id":id,"source":{"publisher":"publisher","host":"huggingface","repository_url":"https://huggingface.co/publisher/model","revision":"pinned","access":"accessible"},"received_bytes":"0","cancel_requested":false,"terminated":false})).unwrap()).unwrap()
}
fn observer() -> Arc<Observer> {
    Arc::new(Observer {
        progress: Mutex::new(progress("job")),
        verified: Mutex::new(0),
        verification_failures: std::sync::atomic::AtomicUsize::new(0),
        reset_failures: std::sync::atomic::AtomicUsize::new(0),
        done: Notify::new(),
        load_delay_ms: std::sync::atomic::AtomicU64::new(0),
        checkpoints: Mutex::default(),
    })
}
fn downloader(
    root: &Path,
    url: &str,
    bytes: Option<u64>,
    digest: Option<String>,
    ceiling: u64,
    observer: Arc<Observer>,
) -> FileDownloads {
    FileDownloads::new(
        root.into(),
        Arc::new(Catalog(DownloadFile {
            format: DownloadFormat::File,
            path: "weights.bin".into(),
            url: url.parse().unwrap(),
            bytes,
            sha256: digest,
        })),
        observer,
        DownloadLimits {
            per_file_bytes: ceiling,
            transfer_bytes: ceiling,
        },
    )
    .unwrap()
}
async fn server(
    body: &[u8],
    status: &str,
    range: Option<&str>,
) -> (String, tokio::task::JoinHandle<String>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let status = status.to_owned();
    let body = body.to_vec();
    let range = range.map(str::to_owned);
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buffer = [0; 8192];
        let size = socket.read(&mut buffer).await.unwrap();
        let headers = range
            .map(|s| format!("Content-Range: {s}\r\n"))
            .unwrap_or_default();
        socket
            .write_all(
                format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\n{headers}Connection: close\r\n\r\n",
                    body.len()
                )
                .as_bytes(),
            )
            .await
            .unwrap();
        socket.write_all(&body).await.unwrap();
        String::from_utf8_lossy(&buffer[..size]).into_owned()
    });
    (format!("http://{addr}/weights"), task)
}
fn partial(root: &Path) -> std::path::PathBuf {
    let source = progress("job").source.clone();
    let key = hex::encode(Sha256::digest(format!(
        "{}\0{}\0{}",
        source.host.as_str(),
        source.repository_url,
        source.revision.as_str()
    )));
    let directory = root.join(key);
    std::fs::create_dir_all(&directory).unwrap();
    directory.join("weights.bin.part")
}
#[tokio::test]
async fn unknown_publisher_size_still_obeys_infrastructure_ceiling() {
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    let (url, server) = server(b"0123456789012345", "200 OK", None).await;
    assert!(
        downloader(root.path(), &url, None, None, 8, observer.clone())
            .transfer(progress("job"))
            .await
            .is_err()
    );
    server.await.unwrap();
    assert_eq!(*observer.verified.lock().unwrap(), 0);
    assert!(std::fs::metadata(partial(root.path())).unwrap().len() <= 8);
}
#[tokio::test]
async fn complete_partial_finalizes_without_http_and_corrupt_or_oversize_restarts() {
    for data in [b"good".as_slice(), b"evil", b"oversized"] {
        let root = tempfile::tempdir().unwrap();
        std::fs::write(partial(root.path()), data).unwrap();
        let observer = observer();
        let digest = hex::encode(Sha256::digest(b"good"));
        if data == b"good" {
            let done = downloader(
                root.path(),
                "http://127.0.0.1:1/unused",
                Some(4),
                Some(digest),
                8,
                observer.clone(),
            )
            .transfer(progress("job"))
            .await
            .unwrap();
            assert!(done.terminated);
        } else {
            let (url, server) = server(b"good", "200 OK", None).await;
            downloader(
                root.path(),
                &url,
                Some(4),
                Some(digest),
                8,
                observer.clone(),
            )
            .transfer(progress("job"))
            .await
            .unwrap();
            assert!(
                server
                    .await
                    .unwrap()
                    .to_lowercase()
                    .contains("range: bytes=0-")
            );
        }
        assert_eq!(*observer.verified.lock().unwrap(), 1);
    }
}
#[tokio::test]
async fn range_416_finalizes_complete_unknown_size_partial() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(partial(root.path()), b"good").unwrap();
    let observer = observer();
    let (url, server) = server(b"", "416 Range Not Satisfiable", Some("bytes */4")).await;
    let done = downloader(
        root.path(),
        &url,
        None,
        Some(hex::encode(Sha256::digest(b"good"))),
        8,
        observer.clone(),
    )
    .transfer(progress("job"))
    .await
    .unwrap();
    assert_eq!(done.received_bytes.get(), 4);
    assert_eq!(*observer.verified.lock().unwrap(), 1);
    assert!(
        server
            .await
            .unwrap()
            .to_lowercase()
            .contains("range: bytes=4-")
    );
}
#[tokio::test]
async fn distinct_ids_and_adapter_instances_cannot_write_same_source_and_abandoned_caller_does_not_strand_id()
 {
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/file", listener.local_addr().unwrap());
    let (started, ready) = oneshot::channel();
    let (release, wait) = oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut bytes = [0; 8192];
        assert!(socket.read(&mut bytes).await.unwrap() > 0);
        started.send(()).unwrap();
        wait.await.unwrap();
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\ngood")
            .await
            .unwrap();
    });
    let digest = Some(hex::encode(Sha256::digest(b"good")));
    let first = downloader(
        root.path(),
        &url,
        Some(4),
        digest.clone(),
        8,
        observer.clone(),
    );
    let caller = tokio::spawn(async move { first.transfer(progress("job")).await });
    ready.await.unwrap();
    caller.abort();
    let second = downloader(root.path(), &url, Some(4), digest, 8, observer.clone());
    assert!(second.transfer(progress("other")).await.is_err());
    release.send(()).unwrap();
    server.await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), observer.done.notified())
        .await
        .unwrap();
    // Progress callback follows verified inventory; wait for the owned task's final cleanup too.
    for _ in 0..20 {
        if second.transfer(progress("job")).await.is_ok() {
            return;
        }
        tokio::task::yield_now().await;
    }
    panic!("completed download identity stayed active");
}

#[tokio::test]
async fn checksum_rejection_removes_partial_so_retry_can_recover() {
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    let digest = Some(hex::encode(Sha256::digest(b"good")));
    let (bad, server) = server(b"evil", "200 OK", None).await;
    assert!(
        downloader(
            root.path(),
            &bad,
            Some(4),
            digest.clone(),
            8,
            observer.clone()
        )
        .transfer(progress("job"))
        .await
        .is_err()
    );
    server.await.unwrap();
    assert!(!partial(root.path()).exists());
    let (good, server) = self::server(b"good", "200 OK", None).await;
    downloader(root.path(), &good, Some(4), digest, 8, observer.clone())
        .transfer(progress("job"))
        .await
        .unwrap();
    server.await.unwrap();
    assert_eq!(*observer.verified.lock().unwrap(), 1);
}

#[tokio::test]
async fn incomplete_206_retains_partial_until_the_advertised_total_is_received() {
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    let (url, first) = server(b"abcd", "206 Partial Content", Some("bytes 0-3/8")).await;
    assert!(
        downloader(root.path(), &url, None, None, 16, observer.clone())
            .transfer(progress("job"))
            .await
            .is_err()
    );
    first.await.unwrap();
    assert_eq!(*observer.verified.lock().unwrap(), 0);
    assert_eq!(std::fs::read(partial(root.path())).unwrap(), b"abcd");
    let (url, last) = server(b"efgh", "206 Partial Content", Some("bytes 4-7/8")).await;
    let done = downloader(root.path(), &url, None, None, 16, observer.clone())
        .transfer(progress("job"))
        .await
        .unwrap();
    assert_eq!(done.received_bytes.get(), 8);
    assert_eq!(*observer.verified.lock().unwrap(), 1);
    assert!(
        last.await
            .unwrap()
            .to_lowercase()
            .contains("range: bytes=4-")
    );
}
#[tokio::test]
async fn malformed_206_and_advertised_total_above_ceiling_never_publish_inventory() {
    for range in [
        "bytes 0-3/999",
        "bytes 0-8/8",
        "bytes 0-3/0",
        "bytes 3-0/8",
        "bytes 0-3/*",
    ] {
        let root = tempfile::tempdir().unwrap();
        let observer = observer();
        let (url, server) = server(b"abcd", "206 Partial Content", Some(range)).await;
        assert!(
            downloader(root.path(), &url, None, None, 16, observer.clone())
                .transfer(progress("job"))
                .await
                .is_err()
        );
        server.await.unwrap();
        assert_eq!(*observer.verified.lock().unwrap(), 0);
    }
}
#[tokio::test]
async fn another_adapter_cancels_via_durable_flag_and_only_confirms_after_writer_release() {
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/file", listener.local_addr().unwrap());
    let (started, ready) = oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut input = [0; 8192];
        assert!(socket.read(&mut input).await.unwrap() > 0);
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 8\r\nConnection: close\r\n\r\nabc")
            .await
            .unwrap();
        started.send(()).unwrap();
        let _ = socket.read(&mut input).await;
    });
    let owner = downloader(root.path(), &url, Some(8), None, 16, observer.clone());
    let transfer = tokio::spawn(async move { owner.transfer(progress("job")).await });
    ready.await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while std::fs::metadata(partial(root.path()))
            .map(|m| m.len())
            .unwrap_or(0)
            != 3
        {
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
    let other = downloader(root.path(), &url, Some(8), None, 16, observer.clone());
    let stopped = other.cancel(ActorId::new("job").unwrap()).await.unwrap();
    assert!(stopped.cancel_requested && stopped.terminated);
    assert!(transfer.await.unwrap().unwrap().terminated);
    server.await.unwrap();
    let size = std::fs::metadata(partial(root.path())).unwrap().len();
    tokio::task::yield_now().await;
    assert_eq!(std::fs::metadata(partial(root.path())).unwrap().len(), size);
    assert_eq!(*observer.verified.lock().unwrap(), 0);
}
struct ManyFiles(Vec<DownloadFile>);
impl FileCatalog for ManyFiles {
    fn files<'a>(
        &'a self,
        _: &'a ModelSource,
    ) -> BoxFuture<'a, Result<Vec<DownloadFile>, AdapterError>> {
        Box::pin(async { Ok(self.0.clone()) })
    }
    fn authorize(
        &self,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, AdapterError>> {
        Box::pin(async { Ok(request) })
    }
}
#[tokio::test]
async fn interrupted_multifile_resume_reuses_checkpointed_computed_hashes_without_publisher_claims()
{
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}/", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let mut paths = Vec::new();
        for (status, range, length, body) in [
            ("200 OK", "", 5, "first"),
            ("200 OK", "", 6, "se"),
            (
                "206 Partial Content",
                "Content-Range: bytes 2-5/6\r\n",
                4,
                "cond",
            ),
        ] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut input = [0; 8192];
            let count = socket.read(&mut input).await.unwrap();
            paths.push(String::from_utf8_lossy(&input[..count]).into_owned());
            socket.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {length}\r\n{range}Connection: close\r\n\r\n{body}").as_bytes()).await.unwrap();
        }
        paths
    });
    let files = vec![
        DownloadFile {
            format: DownloadFormat::File,
            path: "first.bin".into(),
            url: format!("{base}first").parse().unwrap(),
            bytes: None,
            sha256: None,
        },
        DownloadFile {
            format: DownloadFormat::File,
            path: "second.bin".into(),
            url: format!("{base}second").parse().unwrap(),
            bytes: None,
            sha256: None,
        },
    ];
    let adapter = FileDownloads::new(
        root.path().into(),
        Arc::new(ManyFiles(files)),
        observer.clone(),
        DownloadLimits {
            per_file_bytes: 16,
            transfer_bytes: 32,
        },
    )
    .unwrap();
    assert!(adapter.transfer(progress("job")).await.is_err());
    assert_eq!(*observer.verified.lock().unwrap(), 0);
    assert_eq!(observer.checkpoints.lock().unwrap().len(), 1);
    let done = adapter.transfer(progress("job")).await.unwrap();
    assert_eq!(done.received_bytes.get(), 11);
    assert_eq!(*observer.verified.lock().unwrap(), 1);
    assert!(
        observer
            .checkpoints
            .lock()
            .unwrap()
            .values()
            .all(|v| !v.publisher_checksum)
    );
    let requests = server.await.unwrap();
    assert_eq!(
        requests
            .iter()
            .filter(|r| r.starts_with("GET /first "))
            .count(),
        1
    );
    assert!(requests[2].to_lowercase().contains("range: bytes=2-"));
}

#[tokio::test]
async fn hot_chunks_do_not_restart_slow_durable_cancellation_reads() {
    let root = tempfile::tempdir().unwrap();
    let observer = observer();
    observer
        .load_delay_ms
        .store(50, std::sync::atomic::Ordering::Relaxed);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/file", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = [0; 8192];
        assert!(socket.read(&mut request).await.unwrap() > 0);
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 10000000\r\n\r\n")
            .await
            .unwrap();
        for _ in 0..10000 {
            if socket.write_all(&[b'x'; 1000]).await.is_err() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }
    });
    let owner = downloader(root.path(), &url, None, None, 10000000, observer.clone());
    let transfer = tokio::spawn(async move { owner.transfer(progress("job")).await });
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while std::fs::metadata(partial(root.path()))
            .map(|m| m.len())
            .unwrap_or(0)
            == 0
        {
            tokio::time::sleep(std::time::Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
    {
        let mut state = observer.progress.lock().unwrap();
        let mut data = (**state).clone();
        data.cancel_requested = true;
        *state = DownloadProgress::new(data).unwrap();
    }
    let stopped = tokio::time::timeout(std::time::Duration::from_millis(500), transfer)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    assert!(stopped.cancel_requested && stopped.terminated);
    assert!(stopped.received_bytes.get() < 10000000);
    assert_eq!(*observer.verified.lock().unwrap(), 0);
    server.await.unwrap();
}
fn bundle(files: &[(&str, u8, &[u8])]) -> Vec<u8> {
    let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    let mut builder = tar::Builder::new(encoder);
    for (name, kind, body) in files {
        let mut header = tar::Header::new_gnu();
        header.set_mode(0o600);
        header.set_size(body.len() as u64);
        header.set_entry_type(tar::EntryType::new(*kind));
        header.as_mut_bytes()[..name.len()].copy_from_slice(name.as_bytes());
        if *kind == b'1' || *kind == b'2' {
            header.set_link_name("outside").unwrap();
        }
        header.set_cksum();
        builder.append(&header, *body).unwrap();
    }
    builder.into_inner().unwrap().finish().unwrap()
}
async fn install_bundle(
    bytes: &[u8],
    file_limit: u64,
    total_limit: u64,
) -> (
    tempfile::TempDir,
    Arc<Observer>,
    Result<DownloadProgress, AdapterError>,
) {
    use ironloom_models::sources::downloads::ARCHIVE_FILE;
    let root = tempfile::tempdir().unwrap();
    let sink = observer();
    let (url, server) = server(bytes, "200 OK", None).await;
    let downloads = FileDownloads::new(
        root.path().into(),
        Arc::new(Catalog(DownloadFile {
            format: DownloadFormat::TarGzip,
            path: ARCHIVE_FILE.into(),
            url: url.parse().unwrap(),
            bytes: Some(bytes.len() as u64),
            sha256: Some(hex::encode(Sha256::digest(bytes))),
        })),
        sink.clone(),
        DownloadLimits {
            per_file_bytes: file_limit,
            transfer_bytes: total_limit,
        },
    )
    .unwrap();
    let result = downloads.transfer(progress("job")).await;
    server.await.unwrap();
    (root, sink, result)
}
#[tokio::test]
async fn archive_install_checks_extracted_files_and_preserves_computed_versus_publisher_hashes() {
    let bytes = bundle(&[
        ("weights.bin", b'0', b"inert fixture bytes"),
        ("config.json", b'0', b"{}"),
    ]);
    let (root, sink, result) = install_bundle(&bytes, 4096, 8192).await;
    let result = result.unwrap();
    assert!(result.terminated);
    assert_eq!(*sink.verified.lock().unwrap(), 1);
    let checkpoints = sink.checkpoints.lock().unwrap();
    assert_eq!(checkpoints.len(), 3);
    for file in checkpoints.values() {
        assert_eq!(
            hex::encode(Sha256::digest(
                std::fs::read(root.path().join(&file.path)).unwrap()
            )),
            file.sha256
        );
        assert_eq!(
            file.publisher_checksum,
            file.path
                .ends_with(ironloom_models::sources::downloads::ARCHIVE_FILE)
        );
    }
    let directory = root
        .path()
        .join(checkpoints.keys().next().unwrap().parent().unwrap());
    assert!(!std::fs::read_dir(directory).unwrap().any(|entry| {
        entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with(".extract-")
    }));
}
#[tokio::test]
async fn archive_links_traversal_reserved_paths_crc_and_expansion_never_publish_inventory() {
    let mut crc = bundle(&[("weights.bin", b'0', b"fixture")]);
    let end = crc.len();
    crc[end - 8] ^= 1;
    let expanded = vec![0u8; 5000];
    let cases = [
        bundle(&[("../outside", b'0', b"escape")]),
        bundle(&[("weights.bin", b'1', b"")]),
        bundle(&[("weights.bin", b'2', b"")]),
        bundle(&[(".ironloom/secret", b'0', b"forbidden")]),
        crc,
        bundle(&[("weights.bin", b'0', &expanded)]),
    ];
    for bytes in cases {
        let (root, sink, result) = install_bundle(&bytes, 1024, 4096).await;
        assert!(result.is_err());
        assert_eq!(*sink.verified.lock().unwrap(), 0);
        assert!(!root.path().join("outside").exists());
    }
    let bytes = bundle(&[("one", b'0', &[0u8; 700]), ("two", b'0', &[0u8; 700])]);
    let (_, sink, result) = install_bundle(&bytes, 1024, 1400).await;
    assert!(result.is_err());
    assert_eq!(*sink.verified.lock().unwrap(), 0);
}
#[tokio::test]
async fn archive_resume_after_inventory_failure_uses_verified_bytes_without_redownload() {
    use ironloom_models::sources::downloads::ARCHIVE_FILE;
    let bytes = bundle(&[
        ("weights.bin", b'0', b"fixture"),
        ("config.json", b'0', b"{}"),
    ]);
    let root = tempfile::tempdir().unwrap();
    let sink = observer();
    sink.verification_failures
        .store(1, std::sync::atomic::Ordering::SeqCst);
    let (url, server) = server(&bytes, "200 OK", None).await;
    let downloads = FileDownloads::new(
        root.path().into(),
        Arc::new(Catalog(DownloadFile {
            format: DownloadFormat::TarGzip,
            path: ARCHIVE_FILE.into(),
            url: url.parse().unwrap(),
            bytes: Some(bytes.len() as u64),
            sha256: None,
        })),
        sink.clone(),
        DownloadLimits {
            per_file_bytes: 4096,
            transfer_bytes: 8192,
        },
    )
    .unwrap();
    assert!(downloads.transfer(progress("job")).await.is_err());
    server.await.unwrap();
    assert_eq!(sink.checkpoints.lock().unwrap().len(), 3);
    let restored = sink.load(ActorId::new("job").unwrap()).await.unwrap();
    let result = downloads.transfer(restored).await.unwrap();
    assert!(result.terminated);
    assert_eq!(*sink.verified.lock().unwrap(), 1);
    assert!(
        sink.checkpoints
            .lock()
            .unwrap()
            .values()
            .all(|file| !file.publisher_checksum)
    );
}
#[tokio::test]
async fn bounded_pax_metadata_is_supported_but_path_and_size_overrides_cannot_escape_limits() {
    for (key, value, success) in [
        ("mtime", "1.234", true),
        ("path", "../escape", false),
        ("size", "99999", false),
    ] {
        let encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        let mut builder = tar::Builder::new(encoder);
        builder
            .append_pax_extensions([(key, value.as_bytes())])
            .unwrap();
        let mut header = tar::Header::new_gnu();
        header.set_size(7);
        header.set_mode(0o600);
        header.set_cksum();
        builder
            .append_data(&mut header, "weights.bin", &b"fixture"[..])
            .unwrap();
        let bytes = builder.into_inner().unwrap().finish().unwrap();
        let (_, sink, result) = install_bundle(&bytes, 1024, 4096).await;
        assert_eq!(result.is_ok(), success);
        assert_eq!(*sink.verified.lock().unwrap(), usize::from(success));
    }
}

#[tokio::test]
async fn refused_archive_resets_only_after_fenced_persistence_and_recovers_under_same_id() {
    use ironloom_models::sources::downloads::ARCHIVE_FILE;
    let valid = bundle(&[("weights.bin", b'0', b"fixture")]);
    let mut invalid = valid.clone();
    let last = invalid.len() - 1;
    invalid[last] ^= 1;
    let root = tempfile::tempdir().unwrap();
    let sink = observer();
    sink.reset_failures
        .store(1, std::sync::atomic::Ordering::SeqCst);
    let (url, first) = server(&invalid, "200 OK", None).await;
    let make = |url: String| {
        FileDownloads::new(
            root.path().into(),
            Arc::new(Catalog(DownloadFile {
                format: DownloadFormat::TarGzip,
                path: ARCHIVE_FILE.into(),
                url: url.parse().unwrap(),
                bytes: None,
                sha256: None,
            })),
            sink.clone(),
            DownloadLimits {
                per_file_bytes: 4096,
                transfer_bytes: 8192,
            },
        )
        .unwrap()
    };
    assert!(make(url).transfer(progress("job")).await.is_err());
    first.await.unwrap();
    let checkpoint = sink
        .checkpoints
        .lock()
        .unwrap()
        .values()
        .next()
        .unwrap()
        .clone();
    assert!(root.path().join(&checkpoint.path).exists());
    assert!(sink.progress.lock().unwrap().received_bytes.get() > 0);
    // A rejected/stale reset never permits filesystem deletion. A later authorized reset clears
    // unverified counters/checkpoints before deleting only the reserved compressed representation.
    assert!(
        make("http://127.0.0.1:1/unused".into())
            .transfer(progress("job"))
            .await
            .is_err()
    );
    assert!(!root.path().join(&checkpoint.path).exists());
    assert!(sink.checkpoints.lock().unwrap().is_empty());
    assert_eq!(sink.progress.lock().unwrap().received_bytes.get(), 0);
    assert_eq!(*sink.verified.lock().unwrap(), 0);
    let (url, second) = server(&valid, "200 OK", None).await;
    let saved = sink.progress.lock().unwrap().clone();
    let complete = make(url).transfer(saved).await.unwrap();
    second.await.unwrap();
    assert_eq!(complete.download_id.as_str(), "job");
    assert!(complete.terminated);
    assert_eq!(*sink.verified.lock().unwrap(), 1);
    let cache = std::fs::read(root.path().join(&checkpoint.path)).unwrap();
    assert_eq!(cache, valid);
    // Verified inventory makes a later reset fail; existing installed model bytes are retained.
    assert!(sink.reset(complete.download_id.clone()).await.is_err());
    assert_eq!(
        std::fs::read(root.path().join(&checkpoint.path)).unwrap(),
        valid
    );
}

use ironloom_core::{ActorId, BoxFuture, validation::decode};
use ironloom_models::{
    factory::{DownloadProgress, ModelSource},
    providers::AdapterError,
    sources::downloads::{
        DownloadExecutor, DownloadFile, DownloadLimits, DownloadObserver, FileCatalog,
        FileDownloads, VerifiedFile,
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
    done: Notify,
}
impl DownloadObserver for Observer {
    fn load(&self, _: ActorId) -> BoxFuture<'_, Result<DownloadProgress, AdapterError>> {
        Box::pin(async { Ok(self.progress.lock().unwrap().clone()) })
    }
    fn progress(&self, value: DownloadProgress) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async {
            *self.progress.lock().unwrap() = value;
            Ok(())
        })
    }
    fn verified(
        &self,
        _: ModelSource,
        files: Vec<VerifiedFile>,
    ) -> BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            assert_eq!(files.len(), 1);
            *self.verified.lock().unwrap() += 1;
            self.done.notify_one();
            Ok(())
        })
    }
}
fn progress(id: &str) -> DownloadProgress {
    decode(&serde_json::to_vec(&json!({"download_id":id,"source":{"publisher":"publisher","host":"huggingface","repository_url":"https://huggingface.co/publisher/model","revision":"pinned","access":"accessible"},"received_bytes":"0","cancel_requested":false,"terminated":false})).unwrap()).unwrap()
}
fn observer() -> Arc<Observer> {
    Arc::new(Observer {
        progress: Mutex::new(progress("job")),
        verified: Mutex::new(0),
        done: Notify::new(),
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
    body: &'static [u8],
    status: &str,
    range: Option<&str>,
) -> (String, tokio::task::JoinHandle<String>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let status = status.to_owned();
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
        socket.write_all(body).await.unwrap();
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

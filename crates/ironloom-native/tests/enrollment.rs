use ironloom_core::{BoxFuture, Counter, CredentialId, validation::decode};
use ironloom_native::enrollment::{
    EnrollmentError, NativeControl, Registration, RegistrationStore,
};
use ironloom_service::factory::{NativeEnrollment, NativeEnrollmentData};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
struct Vault {
    generation: Arc<AtomicU64>,
    enrollment: NativeEnrollment,
    committed: Mutex<usize>,
    recoveries: AtomicU64,
}
impl RegistrationStore for Vault {
    fn account_request(
        &self,
        _: CredentialId,
        generation: Counter,
        request: reqwest::RequestBuilder,
        recover: bool,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, EnrollmentError>> {
        Box::pin(async move {
            if generation.get() != self.generation.load(Ordering::SeqCst) {
                return Err(EnrollmentError::Authentication);
            }
            if recover {
                self.recoveries.fetch_add(1, Ordering::SeqCst);
            }
            Ok(request
                .bearer_auth("fixture-account")
                .header("ChatGPT-Account-ID", "account-1"))
        })
    }
    fn control_request(
        &self,
        _: NativeEnrollment,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, EnrollmentError>> {
        Box::pin(async { Ok(request.bearer_auth("fixture-control")) })
    }
    fn commit(
        &self,
        _: CredentialId,
        generation: Counter,
        response: Registration,
    ) -> BoxFuture<'_, Result<NativeEnrollment, EnrollmentError>> {
        Box::pin(async move {
            if generation.get() != self.generation.load(Ordering::SeqCst) {
                return Err(EnrollmentError::Authentication);
            }
            assert_eq!(response.token, "fixture-control");
            assert!(!response.expires_at.is_empty());
            *self.committed.lock().unwrap() += 1;
            NativeEnrollment::new(NativeEnrollmentData {
                server_id: response.server,
                environment_id: response.environment,
                ..(*self.enrollment).clone()
            })
            .map_err(|_| EnrollmentError::Protocol)
        })
    }
}
fn enrollment(base: &str) -> NativeEnrollment {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let mut data = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["contract"] == "native_enrollment")
        .unwrap()["input"]
        .clone();
    for (field, path) in [
        ("websocket_url", "socket"),
        ("enroll_url", "enroll"),
        ("refresh_url", "refresh"),
        ("pair_url", "pair"),
        ("pair_status_url", "pair/status"),
    ] {
        data["relay_target"][field] = format!("{base}{path}")
            .replace(
                if field == "websocket_url" {
                    "http://"
                } else {
                    "unused-prefix"
                },
                "ws://",
            )
            .into();
    }
    data["persistence_key"]["websocket_url"] = data["relay_target"]["websocket_url"].clone();
    decode(&serde_json::to_vec(&data).unwrap()).unwrap()
}
async fn server(
    responses: Vec<(&'static str, Value)>,
    rotate: Option<Arc<AtomicU64>>,
) -> (String, tokio::task::JoinHandle<Vec<String>>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let task = tokio::spawn(async move {
        let mut requests = Vec::new();
        for (status, value) in responses {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut buf = [0; 4096];
            loop {
                let count = socket.read(&mut buf).await.unwrap();
                assert_ne!(count, 0);
                request.extend_from_slice(&buf[..count]);
                if let Some(end) = request.windows(4).position(|v| v == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&request[..end]);
                    let size = headers
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if request.len() >= end + 4 + size {
                        break;
                    }
                }
            }
            requests.push(String::from_utf8(request).unwrap());
            if let Some(generation) = &rotate {
                generation.store(3, Ordering::SeqCst);
            }
            let body = value.to_string();
            socket.write_all(format!("HTTP/1.1 {status}\r\nContent-Length: {}\r\nRetry-After: 17\r\nConnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
        requests
    });
    (format!("http://{address}/"), task)
}
fn response(server: &str) -> Value {
    json!({"server_id":server,"environment_id":"environment-1","remote_control_token":"fixture-control","expires_at":"2099-01-01T00:00:00Z"})
}
fn vault(base: &str, generation: Arc<AtomicU64>) -> Arc<Vault> {
    Arc::new(Vault {
        generation,
        enrollment: enrollment(base),
        committed: Mutex::new(0),
        recoveries: AtomicU64::new(0),
    })
}
#[tokio::test]
async fn unauthorized_account_recovers_once_without_changing_registration_identity() {
    let (base, server) = server(
        vec![
            ("401 Unauthorized", json!({})),
            ("200 OK", response("server-1")),
        ],
        None,
    )
    .await;
    let vault = vault(&base, Arc::new(AtomicU64::new(2)));
    let adapter = NativeControl::new(vault.clone()).unwrap();
    let refreshed = adapter.refresh(vault.enrollment.clone()).await.unwrap();
    assert_eq!(refreshed.server_id.as_str(), "server-1");
    assert_eq!(vault.recoveries.load(Ordering::SeqCst), 1);
    assert_eq!(*vault.committed.lock().unwrap(), 1);
    let requests = server.await.unwrap();
    assert!(requests.iter().all(|r| {
        r.starts_with("POST /refresh")
            && r.to_ascii_lowercase()
                .contains("authorization: bearer fixture-account")
    }));
    assert!(requests[0].contains("\"installation_id\":\"installation-1\""));
}
#[tokio::test]
async fn stale_generation_and_mismatched_refresh_cannot_replace_enrollment() {
    let generation = Arc::new(AtomicU64::new(2));
    let (base, server) = server(
        vec![("200 OK", response("server-1"))],
        Some(generation.clone()),
    )
    .await;
    let vault = vault(&base, generation);
    let adapter = NativeControl::new(vault.clone()).unwrap();
    assert_eq!(
        adapter.refresh(vault.enrollment.clone()).await.err(),
        Some(EnrollmentError::Authentication)
    );
    assert_eq!(*vault.committed.lock().unwrap(), 0);
    server.await.unwrap();
    let (base, server) = self::server(vec![("200 OK", response("replacement-server"))], None).await;
    let vault = self::vault(&base, Arc::new(AtomicU64::new(2)));
    let adapter = NativeControl::new(vault.clone()).unwrap();
    assert_eq!(
        adapter.refresh(vault.enrollment.clone()).await.err(),
        Some(EnrollmentError::Protocol)
    );
    assert_eq!(*vault.committed.lock().unwrap(), 0);
    server.await.unwrap();
}
#[tokio::test]
async fn retry_deadlines_and_known_missing_registration_are_distinct_from_other_404s() {
    for (status, body, expected) in [
        (
            "503 Unavailable",
            json!({}),
            EnrollmentError::Deferred(Some("17".into())),
        ),
        (
            "404 Not Found",
            json!({"detail":"Not Found"}),
            EnrollmentError::NotFound,
        ),
        (
            "404 Not Found",
            json!({"detail":"Remote app server not found"}),
            EnrollmentError::MissingRegistration,
        ),
    ] {
        let (base, server) = server(vec![(status, body)], None).await;
        let vault = vault(&base, Arc::new(AtomicU64::new(2)));
        let adapter = NativeControl::new(vault.clone()).unwrap();
        assert_eq!(
            adapter.refresh(vault.enrollment.clone()).await.err(),
            Some(expected)
        );
        assert_eq!(*vault.committed.lock().unwrap(), 0);
        server.await.unwrap();
    }
}

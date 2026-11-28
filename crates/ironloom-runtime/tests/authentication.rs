use ironloom_core::{ActorId, BoxFuture, OperatorId};
use ironloom_policy::{
    factory::{AuthorityCheck, AuthorizationOutcome},
    live::{Authority, AuthorizationError, Relationship},
};
use ironloom_runtime::authentication::AuthenticationBackend;
use ironloom_service::factory::{
    Authentication, AuthenticationError, BootstrapRedeem, BootstrapRedeemData, LoginRequest,
    LoginRequestData, SecretInput,
};
use ironloom_storage::{postgres::Store, secrets::SecretCipher};
use std::{
    collections::BTreeMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
};

struct Grants {
    database: Mutex<Store>,
    unavailable: AtomicBool,
    administrators: Mutex<Vec<OperatorId>>,
}
impl Authority for Grants {
    fn check(&self, _: AuthorityCheck) -> BoxFuture<'_, AuthorizationOutcome> {
        Box::pin(async { AuthorizationOutcome::Denied })
    }
    fn write(
        &self,
        _: Vec<Relationship>,
        _: Vec<Relationship>,
    ) -> BoxFuture<'_, Result<(), AuthorizationError>> {
        Box::pin(async { Err(AuthorizationError::Unavailable) })
    }
    fn bootstrap(&self, operator: OperatorId) -> BoxFuture<'_, Result<(), AuthorizationError>> {
        Box::pin(async move {
            let database = self.database.lock().unwrap().clone();
            let initialization = database
                .bootstrap_initialization(&operator)
                .await
                .map_err(|_| AuthorizationError::Unavailable)?;
            if initialization.initialized() {
                return initialization
                    .complete()
                    .await
                    .map_err(|_| AuthorizationError::Unavailable);
            }
            if self.unavailable.load(Ordering::SeqCst) {
                return Err(AuthorizationError::Unavailable);
            }
            self.administrators.lock().unwrap().push(operator);
            initialization
                .complete()
                .await
                .map_err(|_| AuthorizationError::Unavailable)
        })
    }
}
fn login(username: &str, password: &str) -> LoginRequest {
    LoginRequest::new(LoginRequestData {
        username: ActorId::new(username).unwrap(),
        password: SecretInput::new(password.into()).unwrap(),
    })
    .unwrap()
}
fn redeem() -> BootstrapRedeem {
    BootstrapRedeem::new(BootstrapRedeemData {
        token: SecretInput::new("fixture-setup-token".into()).unwrap(),
    })
    .unwrap()
}
#[tokio::test]
#[ignore = "requires explicitly fresh IRONLOOM_AUTH_TEST_DATABASE_URL; no existing database is erased"]
async fn local_accounts_sessions_and_same_administrator_grant_recovery_survive_restart() {
    let url = std::env::var("IRONLOOM_AUTH_TEST_DATABASE_URL").unwrap();
    let store = Store::connect(&url).await.unwrap();
    store
        .initialize(
            &ActorId::new("authentication-fixture").unwrap(),
            b"fixture-setup-token",
        )
        .await
        .unwrap();
    let grants = Arc::new(Grants {
        database: Mutex::new(store.clone()),
        unavailable: AtomicBool::new(false),
        administrators: Mutex::new(vec![]),
    });
    grants.unavailable.store(true, Ordering::SeqCst);
    let auth = AuthenticationBackend::new(
        store.clone(),
        grants.clone(),
        SecretCipher::new(&[7; 32]),
        BTreeMap::new(),
    )
    .await
    .unwrap();
    assert!(
        auth.register(login("no-token", "fixture-password-1"), None, None)
            .await
            .is_err()
    );
    assert!(
        auth.register(
            login("bad-token", "fixture-password-1"),
            None,
            Some("wrong-token")
        )
        .await
        .is_err()
    );
    let alice = auth
        .register(
            login("alice", "fixture-password-1"),
            None,
            Some("fixture-setup-token"),
        )
        .await
        .unwrap();
    let bob = auth
        .register(
            login("bob", "fixture-password-2"),
            None,
            Some("fixture-setup-token"),
        )
        .await
        .unwrap();
    assert!(matches!(
        auth.login(login("alice", "wrong-password")).await,
        Err(AuthenticationError::InvalidCredentials)
    ));
    assert!(matches!(
        auth.login(login("unknown", "fixture-password-1")).await,
        Err(AuthenticationError::InvalidCredentials)
    ));
    let authenticated = auth
        .authenticate(alice.cookie_token(), Some(alice.csrf_token()))
        .await
        .unwrap();
    assert_eq!(authenticated, alice.session);
    assert!(
        auth.authenticate(alice.cookie_token(), Some("wrong-csrf"))
            .await
            .is_err()
    );
    let bootstrap = auth
        .bootstrap(alice.session.clone(), redeem())
        .await
        .unwrap();
    assert!(!bootstrap.grants_initialized);
    assert!(matches!(
        auth.bootstrap(bob.session.clone(), redeem()).await,
        Err(AuthenticationError::BootstrapConsumed)
    ));
    assert!(
        auth.register(
            login("late-user", "fixture-password-3"),
            None,
            Some("fixture-setup-token")
        )
        .await
        .is_err()
    );
    let cookie = alice.cookie_token().to_owned();
    let csrf = alice.csrf_token().to_owned();
    drop(auth);
    store.close().await;
    let reopened = Store::connect(&url).await.unwrap();
    *grants.database.lock().unwrap() = reopened.clone();
    grants.unavailable.store(false, Ordering::SeqCst);
    let auth = AuthenticationBackend::new(
        reopened.clone(),
        grants.clone(),
        SecretCipher::new(&[7; 32]),
        BTreeMap::new(),
    )
    .await
    .unwrap();
    let session = auth.authenticate(&cookie, Some(&csrf)).await.unwrap();
    let ready = auth.bootstrap(session.clone(), redeem()).await.unwrap();
    assert!(ready.grants_initialized);
    assert_eq!(ready.administrator, alice.session.operator_id);
    assert_eq!(
        &*grants.administrators.lock().unwrap(),
        std::slice::from_ref(&alice.session.operator_id)
    );
    assert_eq!(
        reopened.installation().await.unwrap().1,
        Some(alice.session.operator_id.clone())
    );
    auth.logout(session).await.unwrap();
    assert!(auth.authenticate(&cookie, None).await.is_err());
    let new_session = auth
        .login(login("alice", "fixture-password-1"))
        .await
        .unwrap();
    assert_eq!(new_session.session.operator_id, alice.session.operator_id);
    assert_ne!(new_session.cookie_token(), cookie);
    // Exercise real HTTP cookie/CSRF behavior through the deployment prefix.
    let backend = Arc::new(auth);
    let transport = ironloom_runtime::http::auth::AuthTransport::new(
        backend,
        "http://operator.example/deployment/",
    )
    .unwrap();
    let router = axum::Router::new().nest(
        "/deployment",
        ironloom_runtime::http::auth::router(transport),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!(
        "http://{}/deployment/api/v1/auth",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let client = reqwest::Client::new();
    let request = serde_json::to_value(login("alice", "fixture-password-1")).unwrap();
    assert_eq!(
        client
            .post(format!("{address}/local"))
            .header("Origin", "http://other.example")
            .json(&request)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let response = client
        .post(format!("{address}/local"))
        .header("Origin", "http://operator.example")
        .json(&request)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let csrf = response.headers()["x-ironloom-csrf"]
        .to_str()
        .unwrap()
        .to_owned();
    let cookies = response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|value| value.to_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    assert!(
        cookies
            .iter()
            .any(|cookie| cookie.starts_with("ironloom_session=")
                && cookie.contains("HttpOnly")
                && cookie.contains("Path=/deployment/"))
    );
    let cookie = cookies
        .iter()
        .map(|value| value.split(';').next().unwrap())
        .collect::<Vec<_>>()
        .join("; ");
    let session_json: serde_json::Value = response.json().await.unwrap();
    assert!(session_json.get("token").is_none());
    assert_eq!(
        client
            .get(format!("{address}/session"))
            .header("Cookie", &cookie)
            .send()
            .await
            .unwrap()
            .status(),
        200
    );
    assert_eq!(
        client
            .post(format!("{address}/logout"))
            .header("Cookie", &cookie)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    assert_eq!(
        client
            .post(format!("{address}/logout"))
            .header("Cookie", &cookie)
            .header("x-ironloom-csrf", &csrf)
            .send()
            .await
            .unwrap()
            .status(),
        204
    );
    assert_eq!(
        client
            .get(format!("{address}/session"))
            .header("Cookie", &cookie)
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    server.abort();
    reopened.close().await;
}

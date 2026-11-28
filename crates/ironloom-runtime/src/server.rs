//! Deployable Tokio/Axum composition. Opening configured storage never initializes or replaces it.
use crate::{
    authentication::{AuthenticationBackend, OidcConnection},
    authorization::LiveAuthority,
    backend::{BackendInfrastructure, FactoryBackend},
    http::auth::{AuthTransport, router},
};
use ironloom_core::ActorId;
use ironloom_policy::live::OpenFga;
use ironloom_service::factory::SecretInput;
use ironloom_storage::{postgres::Store, secrets::SecretCipher};
use serde::Deserialize;
use std::{collections::BTreeMap, sync::Arc};

const DATABASE_ENV: &str = "IRONLOOM_DATABASE_URL";
const OPENFGA_ENV: &str = "IRONLOOM_OPENFGA_URL";
const OPENFGA_TOKEN_ENV: &str = "IRONLOOM_OPENFGA_TOKEN";
const OIDC_ENV: &str = "IRONLOOM_OIDC_CONNECTIONS";
/// Redacted configuration/dependency failure. Never print connection strings, keys or issuer responses.
#[derive(Debug, thiserror::Error)]
#[error("factory service configuration or dependency unavailable")]
pub struct StartupError;
fn required(name: &str) -> Result<String, StartupError> {
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or(StartupError)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OidcConfig {
    id: ActorId,
    issuer: String,
    client_id: String,
    client_secret: Option<SecretInput>,
    redirects: BTreeMap<ActorId, String>,
}
fn connections() -> Result<BTreeMap<ActorId, OidcConnection>, StartupError> {
    let Some(json) = std::env::var(OIDC_ENV).ok() else {
        return Ok(BTreeMap::new());
    };
    let configs: Vec<OidcConfig> = serde_json::from_str(&json).map_err(|_| StartupError)?;
    let mut result = BTreeMap::new();
    for config in configs {
        let connection = OidcConnection::new(
            config.issuer,
            config.client_id,
            config.client_secret,
            config.redirects,
        )
        .map_err(|_| StartupError)?;
        if result.insert(config.id, connection).is_some() {
            return Err(StartupError);
        }
    }
    Ok(result)
}
/// Explicit fresh-schema initialization on the selected PostgreSQL connection only.
/// Existing installations are rejected; normal `serve` never invokes this operation.
pub async fn initialize_selected_database() -> Result<(), StartupError> {
    let store = Store::connect(&required(DATABASE_ENV)?)
        .await
        .map_err(|_| StartupError)?;
    let token = required(ironloom_config::IRONLOOM_INSTALLER_TOKEN_ENV)?;
    let installation = ActorId::new(uuid::Uuid::new_v4().to_string()).map_err(|_| StartupError)?;
    let result = store
        .initialize(&installation, token.as_bytes())
        .await
        .map_err(|_| StartupError);
    store.close().await;
    result
}
/// Starts the authenticated service against the selected existing installation.
/// Role execution, source adapters and operator assets are composed into this router as they land.
pub async fn serve(bind: &str) -> Result<(), StartupError> {
    use base64::Engine;
    let store = Store::connect(&required(DATABASE_ENV)?)
        .await
        .map_err(|_| StartupError)?;
    store.installation().await.map_err(|_| StartupError)?;
    let client = OpenFga::new(
        required(OPENFGA_ENV)?,
        std::env::var(OPENFGA_TOKEN_ENV).ok(),
    )
    .map_err(|_| StartupError)?;
    let authority = Arc::new(
        LiveAuthority::open(store.clone(), client)
            .await
            .map_err(|_| StartupError)?,
    );
    let encoded = required(ironloom_config::IRONLOOM_CONFIG_KEY_ENV)?;
    let key: [u8; 32] = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| StartupError)?
        .try_into()
        .map_err(|_| StartupError)?;
    let auth = Arc::new(
        AuthenticationBackend::new(
            store.clone(),
            authority.clone(),
            SecretCipher::new(&key),
            connections()?,
        )
        .await
        .map_err(|_| StartupError)?,
    );
    let public_url = required(ironloom_config::IRONLOOM_PUBLIC_URL_ENV)?;
    let node = ironloom_config::infrastructure::node_configuration(&std::env::vars().collect())
        .map_err(|_| StartupError)?;
    let backend = Arc::new(
        FactoryBackend::new(
            store.clone(),
            auth.clone(),
            authority.clone(),
            BackendInfrastructure {
                node_id: node.node_id,
                projects_root: node.roots.projects.clone().into(),
                providers: Default::default(),
                engines: vec![],
                devices: vec![],
                sandbox_available: false,
            },
        )
        .await
        .map_err(|_| StartupError)?,
    );
    let transport = AuthTransport::new(auth, &public_url).map_err(|_| StartupError)?;
    // Validate now; the source constructor receives these exact bounds at adapter composition.
    crate::configured_download_limits().map_err(|_| StartupError)?;
    let app = axum::Router::new()
        .route("/healthz", axum::routing::get(|| async { "ok" }))
        .merge(crate::http::readiness_router(authority));
    let prefix = url::Url::parse(&public_url)
        .map_err(|_| StartupError)?
        .path()
        .trim_end_matches('/')
        .to_owned();
    let routes = router(transport.clone()).merge(crate::http::factory::router(
        crate::http::factory::FactoryTransport::new(backend.clone(), transport),
    ));
    let app = if prefix.is_empty() {
        app.merge(routes)
    } else {
        app.nest(&prefix, routes)
    };
    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .map_err(|_| StartupError)?;
    let maintenance = backend.start_maintenance();
    let result = axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            shutdown().await;
            backend.close_subscriptions();
        })
        .await
        .map_err(|_| StartupError);
    maintenance.abort();
    let _ = maintenance.await;
    store.close().await;
    result
}
async fn shutdown() {
    #[cfg(unix)]
    {
        if let Ok(mut terminate) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            tokio::select! {_=tokio::signal::ctrl_c()=>{},_=terminate.recv()=>{}}
        } else {
            let _ = tokio::signal::ctrl_c().await;
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}

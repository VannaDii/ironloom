//! Authentication orchestration. Passwords, OIDC credentials and cookies never enter worker context.
use argon2::{
    Argon2,
    password_hash::{PasswordHasher, PasswordVerifier, phc::PasswordHash},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use futures_util::StreamExt;
use ironloom_core::*;
use ironloom_policy::{
    factory::{
        AuthorityCheck, AuthorityCheckData, AuthorizationOutcome, Permission, Resource,
        ResourceData, ResourceKind,
    },
    live::Authority,
};
use ironloom_service::factory::*;
use ironloom_storage::{
    factory::{BootstrapState, BootstrapStateData},
    postgres::{DatabaseError, Store, digest},
    secrets::SecretCipher,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;

pub(crate) const SESSION_SECONDS: i64 = 86_400;
pub(crate) const LOGIN_STATE_SECONDS: i64 = 600;
const PASSWORD_SLOTS: usize = 4;
const MIN_PASSWORD_BYTES: usize = 12;
const MAX_PASSWORD_BYTES: usize = 1024;
const MAX_USERNAME_BYTES: usize = 128;
const MAX_IDP_BYTES: usize = 1_048_576;
const NETWORK_TIMEOUT: Duration = Duration::from_secs(10);
const CLOCK_LEEWAY: u64 = 60;
const CURRENT_PASSWORD_PREFIX: &str = "$argon2id$v=19$";

/// Configured issuer/client and allowlisted callback addresses. No browser-supplied URL is trusted.
#[derive(Clone)]
pub struct OidcConnection {
    issuer: String,
    client_id: String,
    client_secret: Option<SecretInput>,
    redirects: BTreeMap<ActorId, String>,
}
impl OidcConnection {
    /// Validates infrastructure-provided OIDC configuration before any network operation.
    pub fn new(
        issuer: String,
        client_id: String,
        client_secret: Option<SecretInput>,
        redirects: BTreeMap<ActorId, String>,
    ) -> Result<Self, AuthenticationError> {
        secure_url(&issuer)?;
        if client_id.trim().is_empty() || redirects.is_empty() {
            return Err(AuthenticationError::Unavailable);
        }
        for address in redirects.values() {
            secure_url(address)?;
        }
        Ok(Self {
            issuer,
            client_id,
            client_secret,
            redirects,
        })
    }
}
/// Private transport result: session metadata is public, tokens are used only for protected cookies.
pub struct SessionGrant {
    /// Validated authenticated identity returned by public API responses.
    pub session: AuthenticatedSession,
    pub(crate) token: String,
    pub(crate) csrf: String,
}
impl SessionGrant {
    /// Opaque value for the transport's HttpOnly session cookie; never include in API JSON.
    pub fn cookie_token(&self) -> &str {
        &self.token
    }
    /// CSRF proof returned through the protected login transport for subsequent mutations.
    pub fn csrf_token(&self) -> &str {
        &self.csrf
    }
}
/// Authentication backend shared by web/native composition, with no provider-inference credentials.
pub struct AuthenticationBackend {
    store: Store,
    authority: Arc<dyn Authority>,
    cipher: SecretCipher,
    connections: BTreeMap<ActorId, OidcConnection>,
    client: reqwest::Client,
    password_slots: Arc<Semaphore>,
    dummy_hash: String,
}
impl AuthenticationBackend {
    /// Constructs the backend and prepares a non-user dummy hash so unknown accounts perform KDF work.
    pub async fn new(
        store: Store,
        authority: Arc<dyn Authority>,
        cipher: SecretCipher,
        connections: BTreeMap<ActorId, OidcConnection>,
    ) -> Result<Self, AuthenticationError> {
        let dummy_hash = tokio::task::spawn_blocking(|| {
            Argon2::default()
                .hash_password(b"not-a-user-fixture-or-credential")
                .map(|hash| hash.to_string())
        })
        .await
        .map_err(|_| AuthenticationError::Unavailable)?
        .map_err(|_| AuthenticationError::Unavailable)?;
        let client = reqwest::Client::builder()
            .timeout(NETWORK_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AuthenticationError::Unavailable)?;
        Ok(Self {
            store,
            authority,
            cipher,
            connections,
            client,
            password_slots: Arc::new(Semaphore::new(PASSWORD_SLOTS)),
            dummy_hash,
        })
    }
    /// Provisions a normal account using current administrator authority or a still-valid setup token.
    /// The token authorizes provisioning only; administrator redemption remains a separate operation.
    pub async fn register(
        &self,
        request: LoginRequest,
        administrator: Option<AuthenticatedSession>,
        setup_token: Option<&str>,
    ) -> Result<SessionGrant, ServiceError> {
        if request.username.as_str().len() > MAX_USERNAME_BYTES
            || request.password.expose().len() < MIN_PASSWORD_BYTES
            || request.password.expose().len() > MAX_PASSWORD_BYTES
        {
            return Err(ServiceError::Validation(
                ironloom_core::validation::ValidationErrors::field("password", "password_policy"),
            ));
        }
        let is_admin = if let Some(session) = administrator {
            self.ensure_session(&session)
                .await
                .map_err(ServiceError::Authentication)?;
            let (installation, _, _) = self
                .store
                .installation()
                .await
                .map_err(database_auth)
                .map_err(ServiceError::Authentication)?;
            let resource = Resource::new(ResourceData {
                kind: ResourceKind::Installation,
                id: installation,
                project_id: None,
            })
            .map_err(ServiceError::Validation)?;
            let check = AuthorityCheck::new(AuthorityCheckData {
                operator_id: session.operator_id.clone(),
                worker_id: None,
                assignment_id: None,
                resource,
                permission: Permission::Manage,
                authorization_model: model_revision(),
            })
            .map_err(ServiceError::Validation)?;
            match self.authority.check(check).await {
                AuthorizationOutcome::Allowed => true,
                AuthorizationOutcome::Unavailable => {
                    return Err(ServiceError::Authentication(
                        AuthenticationError::Unavailable,
                    ));
                }
                _ => return Err(ServiceError::Authentication(AuthenticationError::Forbidden)),
            }
        } else {
            false
        };
        if !is_admin && setup_token.is_none() {
            return Err(ServiceError::Authentication(AuthenticationError::Forbidden));
        }
        let permit = self
            .password_slots
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        let password = request.password.expose().as_bytes().to_vec();
        let hash = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            Argon2::default()
                .hash_password(&password)
                .map(|hash| hash.to_string())
        })
        .await
        .map_err(|_| ServiceError::Unavailable)?
        .map_err(|_| ServiceError::Unavailable)?;
        let operator = OperatorId::new(uuid::Uuid::new_v4().to_string())
            .map_err(|_| ServiceError::Unavailable)?;
        if is_admin {
            self.store
                .register_local(&operator, request.username.as_str(), &hash)
                .await
        } else {
            self.store
                .register_initial(
                    &operator,
                    request.username.as_str(),
                    &hash,
                    setup_token.unwrap_or_default().as_bytes(),
                )
                .await
        }
        .map_err(|error| match error {
            DatabaseError::Conflict => ServiceError::Conflict,
            _ => ServiceError::Unavailable,
        })?;
        self.issue(operator, LoginMethod::Local)
            .await
            .map_err(ServiceError::Authentication)
    }
    /// Verifies local credentials with bounded KDF concurrency, issuing an opaque revocable session.
    pub async fn login(&self, request: LoginRequest) -> Result<SessionGrant, AuthenticationError> {
        if request.password.expose().len() > MAX_PASSWORD_BYTES
            || request.username.as_str().len() > MAX_USERNAME_BYTES
        {
            return Err(AuthenticationError::InvalidCredentials);
        }
        let identity = self
            .store
            .local_identity(request.username.as_str())
            .await
            .map_err(database_auth)?;
        let hash = identity
            .as_ref()
            .map(|(_, hash)| hash.clone())
            .unwrap_or_else(|| self.dummy_hash.clone());
        let password = request.password.expose().as_bytes().to_vec();
        let permit = self
            .password_slots
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| AuthenticationError::Unavailable)?;
        let valid = tokio::task::spawn_blocking(move || {
            let _permit = permit;
            if !hash.starts_with(CURRENT_PASSWORD_PREFIX) {
                return false;
            }
            PasswordHash::new(&hash).is_ok_and(|parsed| {
                Argon2::default()
                    .verify_password(&password, &parsed)
                    .is_ok()
            })
        })
        .await
        .map_err(|_| AuthenticationError::Unavailable)?;
        let Some((operator, _)) = identity.filter(|_| valid) else {
            return Err(AuthenticationError::InvalidCredentials);
        };
        self.issue(operator, LoginMethod::Local).await
    }
    /// Resolves a protected cookie/bearer token and optional CSRF proof without trusting client identity.
    pub async fn authenticate(
        &self,
        token: &str,
        csrf: Option<&str>,
    ) -> Result<AuthenticatedSession, AuthenticationError> {
        let (operator, session, method, expiry) = self
            .store
            .session(token.as_bytes(), csrf.map(str::as_bytes))
            .await
            .map_err(database_auth)?
            .ok_or(AuthenticationError::Unauthenticated)?;
        let method = match method.as_str() {
            "local" => LoginMethod::Local,
            "oidc" => LoginMethod::Oidc,
            _ => return Err(AuthenticationError::Unavailable),
        };
        AuthenticatedSession::new(AuthenticatedSessionData {
            operator_id: operator,
            session_id: session,
            method,
            expires_at_ms: Counter::new(expiry),
        })
        .map_err(|_| AuthenticationError::Unavailable)
    }
    /// Rechecks direct/native sessions for expiry/revocation before a service operation.
    pub async fn ensure_session(
        &self,
        session: &AuthenticatedSession,
    ) -> Result<(), AuthenticationError> {
        if !self
            .store
            .session_active(&session.session_id, &session.operator_id)
            .await
            .map_err(database_auth)?
        {
            return Err(AuthenticationError::Unauthenticated);
        }
        Ok(())
    }
    async fn issue(
        &self,
        operator: OperatorId,
        method: LoginMethod,
    ) -> Result<SessionGrant, AuthenticationError> {
        let token = random_secret();
        let csrf = random_secret();
        let session_id = ActorId::new(uuid::Uuid::new_v4().to_string())
            .map_err(|_| AuthenticationError::Unavailable)?;
        let expiry = self
            .store
            .save_session(
                &session_id,
                &operator,
                token.as_bytes(),
                csrf.as_bytes(),
                match method {
                    LoginMethod::Local => "local",
                    LoginMethod::Oidc => "oidc",
                },
                SESSION_SECONDS,
            )
            .await
            .map_err(database_auth)?;
        let session = AuthenticatedSession::new(AuthenticatedSessionData {
            operator_id: operator,
            session_id,
            method,
            expires_at_ms: Counter::new(expiry),
        })
        .map_err(|_| AuthenticationError::Unavailable)?;
        Ok(SessionGrant {
            session,
            token,
            csrf,
        })
    }
    async fn discovery(
        &self,
        connection: &OidcConnection,
    ) -> Result<Discovery, AuthenticationError> {
        let url = format!(
            "{}/.well-known/openid-configuration",
            connection.issuer.trim_end_matches('/')
        );
        let discovery: Discovery = bounded_json(
            self.client
                .get(url)
                .send()
                .await
                .map_err(|_| AuthenticationError::Unavailable)?,
        )
        .await?;
        if discovery.issuer != connection.issuer {
            return Err(AuthenticationError::Unavailable);
        }
        for endpoint in [
            &discovery.authorization_endpoint,
            &discovery.token_endpoint,
            &discovery.jwks_uri,
        ] {
            secure_url(endpoint)?;
        }
        Ok(discovery)
    }
    /// Starts issuer-bound authorization-code login with PKCE, nonce, one-time state and callback allowlist.
    /// HTTP also binds the returned state to an HttpOnly login-flow cookie before redirecting.
    pub async fn start_oidc(&self, request: OidcStart) -> Result<String, AuthenticationError> {
        let connection = self
            .connections
            .get(&request.connection)
            .ok_or(AuthenticationError::InvalidCredentials)?;
        let redirect = connection
            .redirects
            .get(&request.redirect_id)
            .ok_or(AuthenticationError::InvalidCredentials)?
            .clone();
        let discovery = self.discovery(connection).await?;
        let state = random_secret();
        let nonce = random_secret();
        let verifier = random_secret();
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        let context = LoginContext {
            connection: request.connection.clone(),
            redirect,
            nonce: nonce.clone(),
            verifier,
        };
        let bytes = serde_json::to_vec(&context).map_err(|_| AuthenticationError::Unavailable)?;
        let ciphertext = self
            .cipher
            .seal(&state_context(&state), &bytes)
            .map_err(database_auth)?;
        self.store
            .save_oidc_attempt(state.as_bytes(), &ciphertext, LOGIN_STATE_SECONDS)
            .await
            .map_err(database_auth)?;
        let mut url = reqwest::Url::parse(&discovery.authorization_endpoint)
            .map_err(|_| AuthenticationError::Unavailable)?;
        url.query_pairs_mut().extend_pairs([
            ("response_type", "code"),
            ("client_id", connection.client_id.as_str()),
            ("redirect_uri", context.redirect.as_str()),
            ("scope", "openid"),
            ("state", &state),
            ("nonce", &nonce),
            ("code_challenge", &challenge),
            ("code_challenge_method", "S256"),
        ]);
        Ok(url.into())
    }
    /// Consumes login state once, exchanges the code with PKCE and validates provider JWT/JWK claims.
    pub async fn complete_oidc(
        &self,
        request: OidcCallback,
    ) -> Result<SessionGrant, AuthenticationError> {
        let state = request.state.expose();
        let protected = self
            .store
            .consume_oidc_attempt(state.as_bytes())
            .await
            .map_err(database_auth)?
            .ok_or(AuthenticationError::InvalidCredentials)?;
        let plaintext = self
            .cipher
            .open(&state_context(state), &protected)
            .map_err(database_auth)?;
        let context: LoginContext = serde_json::from_slice(&plaintext)
            .map_err(|_| AuthenticationError::InvalidCredentials)?;
        let connection = self
            .connections
            .get(&context.connection)
            .ok_or(AuthenticationError::InvalidCredentials)?;
        if !connection
            .redirects
            .values()
            .any(|redirect| redirect == &context.redirect)
        {
            return Err(AuthenticationError::InvalidCredentials);
        }
        let discovery = self.discovery(connection).await?;
        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("code", request.code.expose()),
            ("redirect_uri", &context.redirect),
            ("code_verifier", &context.verifier),
            ("client_id", &connection.client_id),
        ];
        let mut exchange = self.client.post(&discovery.token_endpoint);
        if let Some(secret) = &connection.client_secret {
            let methods = discovery
                .token_endpoint_auth_methods_supported
                .as_deref()
                .unwrap_or(&[]);
            if methods.is_empty() || methods.iter().any(|method| method == "client_secret_basic") {
                exchange = exchange.basic_auth(&connection.client_id, Some(secret.expose()));
            } else if methods.iter().any(|method| method == "client_secret_post") {
                form.push(("client_secret", secret.expose()));
            } else {
                return Err(AuthenticationError::Unavailable);
            }
        } else if discovery
            .token_endpoint_auth_methods_supported
            .as_ref()
            .is_some_and(|methods| !methods.iter().any(|method| method == "none"))
        {
            return Err(AuthenticationError::Unavailable);
        }
        let tokens: TokenResponse = bounded_json(
            exchange
                .form(&form)
                .send()
                .await
                .map_err(|_| AuthenticationError::Unavailable)?,
        )
        .await?;
        let keys: jsonwebtoken::jwk::JwkSet = bounded_json(
            self.client
                .get(&discovery.jwks_uri)
                .send()
                .await
                .map_err(|_| AuthenticationError::Unavailable)?,
        )
        .await?;
        let claims = validate_id_token(
            &tokens.id_token,
            connection,
            &discovery,
            &keys,
            &context.nonce,
        )?;
        if let Some(expected) = &claims.at_hash {
            let access = tokens
                .access_token
                .as_deref()
                .ok_or(AuthenticationError::InvalidCredentials)?;
            let algorithm = jsonwebtoken::decode_header(&tokens.id_token)
                .map_err(|_| AuthenticationError::InvalidCredentials)?
                .alg;
            let hash = token_hash(access.as_bytes(), algorithm)?;
            if digest(expected.as_bytes()) != digest(hash.as_bytes()) {
                return Err(AuthenticationError::InvalidCredentials);
            }
        }
        let operator = self
            .store
            .oidc_identity(&connection.issuer, &claims.sub)
            .await
            .map_err(database_auth)?;
        self.issue(operator, LoginMethod::Oidc).await
    }
}
impl Authentication for AuthenticationBackend {
    fn local(
        &self,
        request: LoginRequest,
    ) -> BoxFuture<'_, Result<AuthenticatedSession, AuthenticationError>> {
        Box::pin(async move { Ok(self.login(request).await?.session) })
    }
    fn oidc_start(&self, request: OidcStart) -> BoxFuture<'_, Result<String, AuthenticationError>> {
        Box::pin(self.start_oidc(request))
    }
    fn oidc_callback(
        &self,
        request: OidcCallback,
    ) -> BoxFuture<'_, Result<AuthenticatedSession, AuthenticationError>> {
        Box::pin(async move { Ok(self.complete_oidc(request).await?.session) })
    }
    fn bootstrap(
        &self,
        session: AuthenticatedSession,
        request: BootstrapRedeem,
    ) -> BoxFuture<'_, Result<BootstrapState, AuthenticationError>> {
        Box::pin(async move {
            self.ensure_session(&session).await?;
            let (installation, administrator, grants_initialized) =
                self.store.installation().await.map_err(database_auth)?;
            match administrator {
                None => {
                    self.store
                        .redeem_bootstrap(&session.operator_id, request.token.expose().as_bytes())
                        .await
                        .map_err(|error| match error {
                            DatabaseError::Conflict => AuthenticationError::InvalidCredentials,
                            _ => AuthenticationError::Unavailable,
                        })?;
                }
                Some(administrator) if administrator != session.operator_id => {
                    return Err(AuthenticationError::BootstrapConsumed);
                }
                Some(_) => {}
            }
            // An interrupted grant initialization retries only the already-persisted account.
            if !grants_initialized {
                // The concrete authority holds the storage lock across its completion recheck,
                // idempotent OpenFGA write and durable completion, including concurrent retries.
                let _ = self.authority.bootstrap(session.operator_id.clone()).await;
            }
            let (_, _, initialized) = self.store.installation().await.map_err(database_auth)?;
            BootstrapState::new(BootstrapStateData {
                installation_id: InstallationId::new(installation.as_str())
                    .map_err(|_| AuthenticationError::Unavailable)?,
                administrator: session.operator_id.clone(),
                grants_initialized: initialized,
            })
            .map_err(|_| AuthenticationError::Unavailable)
        })
    }
    fn logout(
        &self,
        session: AuthenticatedSession,
    ) -> BoxFuture<'_, Result<(), AuthenticationError>> {
        Box::pin(async move {
            self.ensure_session(&session).await?;
            self.store
                .revoke_session(&session.session_id, &session.operator_id)
                .await
                .map_err(database_auth)
        })
    }
}
#[derive(Serialize, Deserialize)]
struct LoginContext {
    connection: ActorId,
    redirect: String,
    nonce: String,
    verifier: String,
}
#[derive(Deserialize)]
struct Discovery {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    jwks_uri: String,
    id_token_signing_alg_values_supported: Vec<String>,
    token_endpoint_auth_methods_supported: Option<Vec<String>>,
}
#[derive(Deserialize)]
struct TokenResponse {
    id_token: String,
    access_token: Option<String>,
}
#[derive(Deserialize)]
struct IdClaims {
    sub: String,
    iat: u64,
    exp: u64,
    nonce: String,
    aud: serde_json::Value,
    azp: Option<String>,
    at_hash: Option<String>,
}
fn validate_id_token(
    token: &str,
    connection: &OidcConnection,
    discovery: &Discovery,
    keys: &jsonwebtoken::jwk::JwkSet,
    nonce: &str,
) -> Result<IdClaims, AuthenticationError> {
    use jsonwebtoken::{Algorithm, DecodingKey, Validation};
    let header =
        jsonwebtoken::decode_header(token).map_err(|_| AuthenticationError::InvalidCredentials)?;
    if !matches!(
        header.alg,
        Algorithm::RS256
            | Algorithm::RS384
            | Algorithm::RS512
            | Algorithm::PS256
            | Algorithm::PS384
            | Algorithm::PS512
            | Algorithm::ES256
            | Algorithm::ES384
            | Algorithm::EdDSA
    ) || !discovery
        .id_token_signing_alg_values_supported
        .iter()
        .any(|algorithm| algorithm == &format!("{:?}", header.alg))
    {
        return Err(AuthenticationError::InvalidCredentials);
    }
    let matching = keys
        .keys
        .iter()
        .filter(|key| {
            header
                .kid
                .as_ref()
                .is_none_or(|id| key.common.key_id.as_ref() == Some(id))
        })
        .collect::<Vec<_>>();
    if matching.len() != 1 {
        return Err(AuthenticationError::InvalidCredentials);
    }
    let key = matching[0];
    if key
        .common
        .key_algorithm
        .is_some_and(|algorithm| algorithm != header.alg.into())
        || key
            .common
            .public_key_use
            .as_ref()
            .is_some_and(|use_| *use_ != jsonwebtoken::jwk::PublicKeyUse::Signature)
        || key
            .common
            .key_operations
            .as_ref()
            .is_some_and(|operations| {
                !operations.contains(&jsonwebtoken::jwk::KeyOperations::Verify)
            })
    {
        return Err(AuthenticationError::InvalidCredentials);
    }
    let decoding =
        DecodingKey::from_jwk(key).map_err(|_| AuthenticationError::InvalidCredentials)?;
    let mut validation = Validation::new(header.alg);
    validation.set_issuer(&[&connection.issuer]);
    validation.set_audience(&[&connection.client_id]);
    validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
    validation.validate_nbf = true;
    validation.leeway = CLOCK_LEEWAY;
    let claims = jsonwebtoken::decode::<IdClaims>(token, &decoding, &validation)
        .map_err(|_| AuthenticationError::InvalidCredentials)?
        .claims;
    if claims.sub.trim().is_empty()
        || claims.iat > now_seconds()?.saturating_add(CLOCK_LEEWAY)
        || claims.iat > claims.exp
        || digest(claims.nonce.as_bytes()) != digest(nonce.as_bytes())
    {
        return Err(AuthenticationError::InvalidCredentials);
    }
    if claims
        .azp
        .as_ref()
        .is_some_and(|party| party != &connection.client_id)
        || claims
            .aud
            .as_array()
            .is_some_and(|audiences| audiences.len() > 1)
            && claims.azp.as_deref() != Some(&connection.client_id)
    {
        return Err(AuthenticationError::InvalidCredentials);
    }
    Ok(claims)
}
fn token_hash(
    bytes: &[u8],
    algorithm: jsonwebtoken::Algorithm,
) -> Result<String, AuthenticationError> {
    use jsonwebtoken::Algorithm;
    let hash = match algorithm {
        Algorithm::RS256 | Algorithm::PS256 | Algorithm::ES256 => Sha256::digest(bytes).to_vec(),
        Algorithm::RS384 | Algorithm::PS384 | Algorithm::ES384 => {
            sha2::Sha384::digest(bytes).to_vec()
        }
        Algorithm::RS512 | Algorithm::PS512 | Algorithm::EdDSA => {
            sha2::Sha512::digest(bytes).to_vec()
        }
        _ => return Err(AuthenticationError::InvalidCredentials),
    };
    Ok(URL_SAFE_NO_PAD.encode(&hash[..hash.len() / 2]))
}
async fn bounded_json<T: serde::de::DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, AuthenticationError> {
    let response = response
        .error_for_status()
        .map_err(|_| AuthenticationError::InvalidCredentials)?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_IDP_BYTES as u64)
    {
        return Err(AuthenticationError::Unavailable);
    }
    let mut body = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| AuthenticationError::Unavailable)?;
        if body.len().saturating_add(chunk.len()) > MAX_IDP_BYTES {
            return Err(AuthenticationError::Unavailable);
        }
        body.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&body).map_err(|_| AuthenticationError::InvalidCredentials)
}
fn secure_url(value: &str) -> Result<(), AuthenticationError> {
    let url = reqwest::Url::parse(value).map_err(|_| AuthenticationError::Unavailable)?;
    let local = match url.host() {
        Some(url::Host::Domain("localhost")) => true,
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        _ => false,
    };
    if !(url.scheme() == "https" || url.scheme() == "http" && local)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(AuthenticationError::Unavailable);
    }
    Ok(())
}
fn state_context(state: &str) -> String {
    format!("oidc:{}", hex::encode(digest(state.as_bytes())))
}
fn random_secret() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}
fn now_seconds() -> Result<u64, AuthenticationError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| AuthenticationError::Unavailable)
}
fn database_auth(_: DatabaseError) -> AuthenticationError {
    AuthenticationError::Unavailable
}
/// Current authorization model fingerprint shared by all nodes; mismatch never triggers an upgrade.
pub fn model_revision() -> ActorId {
    ActorId::new(hex::encode(Sha256::digest(include_bytes!(
        "../../ironloom-policy/authorization-model.json"
    ))))
    .expect("static model digest is nonempty")
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use serde_json::{Value, json};
    fn connection() -> OidcConnection {
        OidcConnection::new(
            "https://issuer.example".into(),
            "operator-client".into(),
            None,
            BTreeMap::from([(
                ActorId::new("web").unwrap(),
                "https://service.example/auth/callback".into(),
            )]),
        )
        .unwrap()
    }
    fn discovery() -> Discovery {
        Discovery {
            issuer: "https://issuer.example".into(),
            authorization_endpoint: "https://issuer.example/auth".into(),
            token_endpoint: "https://issuer.example/token".into(),
            jwks_uri: "https://issuer.example/keys".into(),
            id_token_signing_alg_values_supported: vec!["EdDSA".into()],
            token_endpoint_auth_methods_supported: None,
        }
    }
    fn claims() -> Value {
        let now = now_seconds().unwrap();
        json!({"iss":"https://issuer.example","sub":"stable-human","aud":"operator-client","iat":now,"exp":now+300,"nonce":"login-nonce"})
    }
    fn signed(claims: &Value, seed: u8) -> String {
        let header = URL_SAFE_NO_PAD.encode(br#"{"alg":"EdDSA","kid":"fixture-key","typ":"JWT"}"#);
        let body = URL_SAFE_NO_PAD.encode(serde_json::to_vec(claims).unwrap());
        let message = format!("{header}.{body}");
        let signature = SigningKey::from_bytes(&[seed; 32]).sign(message.as_bytes());
        format!("{message}.{}", URL_SAFE_NO_PAD.encode(signature.to_bytes()))
    }
    fn keys() -> jsonwebtoken::jwk::JwkSet {
        serde_json::from_value(json!({"keys":[{"kty":"OKP","crv":"Ed25519","kid":"fixture-key","alg":"EdDSA","use":"sig","key_ops":["verify"],"x":URL_SAFE_NO_PAD.encode(SigningKey::from_bytes(&[7;32]).verifying_key().to_bytes())}]})).unwrap()
    }
    #[test]
    fn oidc_checks_signature_issuer_audience_nonce_expiry_and_key_purpose() {
        let connection = connection();
        let discovery = discovery();
        let keys = keys();
        assert!(
            validate_id_token(
                &signed(&claims(), 7),
                &connection,
                &discovery,
                &keys,
                "login-nonce"
            )
            .is_ok()
        );
        assert!(
            validate_id_token(
                &signed(&claims(), 8),
                &connection,
                &discovery,
                &keys,
                "login-nonce"
            )
            .is_err()
        );
        assert!(
            validate_id_token(
                &signed(&claims(), 7),
                &connection,
                &discovery,
                &keys,
                "another-browser"
            )
            .is_err()
        );
        for (field, value) in [
            ("iss", json!("https://other.example")),
            ("aud", json!("other-client")),
            ("exp", json!(now_seconds().unwrap() - 3600)),
            ("azp", json!("another-client")),
            ("sub", json!("")),
        ] {
            let mut invalid = claims();
            invalid[field] = value;
            assert!(
                validate_id_token(
                    &signed(&invalid, 7),
                    &connection,
                    &discovery,
                    &keys,
                    "login-nonce"
                )
                .is_err(),
                "{field}"
            );
        }
        let mut invalid = claims();
        invalid["aud"] = json!(["operator-client", "another-client"]);
        assert!(
            validate_id_token(
                &signed(&invalid, 7),
                &connection,
                &discovery,
                &keys,
                "login-nonce"
            )
            .is_err()
        );
        invalid["azp"] = json!("operator-client");
        assert!(
            validate_id_token(
                &signed(&invalid, 7),
                &connection,
                &discovery,
                &keys,
                "login-nonce"
            )
            .is_ok()
        );
        let mut wrong_key = keys.clone();
        wrong_key.keys[0].common.key_algorithm = Some(jsonwebtoken::jwk::KeyAlgorithm::ES256);
        assert!(
            validate_id_token(
                &signed(&claims(), 7),
                &connection,
                &discovery,
                &wrong_key,
                "login-nonce"
            )
            .is_err()
        );
    }
    #[test]
    fn oidc_endpoints_and_token_hashes_follow_explicit_secure_configuration() {
        assert!(secure_url("http://untrusted.example/token").is_err());
        assert!(secure_url("https://user:secret@issuer.example/token").is_err());
        assert!(secure_url("http://127.0.0.1:8000/token").is_ok());
        assert_ne!(
            token_hash(b"access-a", jsonwebtoken::Algorithm::RS256).unwrap(),
            token_hash(b"access-b", jsonwebtoken::Algorithm::RS256).unwrap()
        );
        assert!(token_hash(b"access", jsonwebtoken::Algorithm::HS256).is_err());
    }
}

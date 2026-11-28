//! Cookie/session HTTP transport. This module delegates authentication and never chooses authority.
use crate::authentication::{
    AuthenticationBackend, LOGIN_STATE_SECONDS, SESSION_SECONDS, SessionGrant,
};
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use ironloom_core::validation::{ValidationErrors, Wire, decode};
use ironloom_service::factory::*;
use std::sync::Arc;

const MAX_AUTH_BODY: usize = 16 * 1024;
const SESSION_COOKIE: &str = "ironloom_session";
const CSRF_COOKIE: &str = "ironloom_csrf";
const FLOW_COOKIE: &str = "ironloom_oidc";
/// CSRF proof header for authenticated HTTP mutations; session credentials remain HttpOnly.
pub const CSRF_HEADER: &str = "x-ironloom-csrf";
/// Setup token header used only for initial normal-account provisioning, never administrator replacement.
pub const SETUP_HEADER: &str = "x-ironloom-setup-token";
/// Authentication transport configuration fixed by the deployment composition.
#[derive(Clone)]
pub struct AuthTransport {
    backend: Arc<AuthenticationBackend>,
    origin: String,
    path: String,
    secure: bool,
}
impl AuthTransport {
    /// Validates the configured public deployment address and derives its cookie path/origin.
    pub fn new(
        backend: Arc<AuthenticationBackend>,
        public_url: &str,
    ) -> Result<Self, ServiceError> {
        let url = url::Url::parse(public_url).map_err(|_| ServiceError::Unavailable)?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err(ServiceError::Unavailable);
        }
        let path = format!("{}/", url.path().trim_end_matches('/'));
        if !path
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"/-_.~%".contains(&b))
        {
            return Err(ServiceError::Unavailable);
        }
        Ok(Self {
            backend,
            origin: url.origin().ascii_serialization(),
            path,
            secure: url.scheme() == "https",
        })
    }
    fn origin(&self, headers: &HeaderMap) -> Result<(), HttpError> {
        if headers
            .get(header::ORIGIN)
            .is_some_and(|value| value.to_str().ok() != Some(&self.origin))
            || headers
                .get("sec-fetch-site")
                .is_some_and(|value| value == "cross-site")
        {
            return Err(HttpError(ServiceError::Authentication(
                AuthenticationError::Forbidden,
            )));
        }
        Ok(())
    }
    /// Resolves a current opaque cookie and requires its CSRF proof for mutations.
    pub async fn authenticate(
        &self,
        headers: &HeaderMap,
        mutation: bool,
    ) -> Result<AuthenticatedSession, ServiceError> {
        self.origin(headers).map_err(|error| error.0)?;
        let cookie = cookie(headers, SESSION_COOKIE).ok_or(ServiceError::Authentication(
            AuthenticationError::Unauthenticated,
        ))?;
        let csrf = if mutation {
            Some(
                headers
                    .get(CSRF_HEADER)
                    .and_then(|value| value.to_str().ok())
                    .ok_or(ServiceError::Authentication(AuthenticationError::Forbidden))?,
            )
        } else {
            None
        };
        self.backend
            .authenticate(cookie, csrf)
            .await
            .map_err(ServiceError::Authentication)
    }
    fn cookie(
        &self,
        name: &str,
        value: &str,
        http_only: bool,
        max_age: u64,
    ) -> Result<HeaderValue, HttpError> {
        HeaderValue::from_str(&format!(
            "{name}={value}; Path={}; SameSite=Lax; Max-Age={max_age}{}{}",
            self.path,
            if self.secure { "; Secure" } else { "" },
            if http_only { "; HttpOnly" } else { "" }
        ))
        .map_err(|_| HttpError(ServiceError::Unavailable))
    }
    fn grant(&self, grant: SessionGrant) -> Result<Response, HttpError> {
        let mut response = Json(grant.session.clone()).into_response();
        response.headers_mut().append(
            header::SET_COOKIE,
            self.cookie(
                SESSION_COOKIE,
                grant.cookie_token(),
                true,
                SESSION_SECONDS as u64,
            )?,
        );
        response.headers_mut().append(
            header::SET_COOKIE,
            self.cookie(
                CSRF_COOKIE,
                grant.csrf_token(),
                false,
                SESSION_SECONDS as u64,
            )?,
        );
        response.headers_mut().insert(
            CSRF_HEADER,
            HeaderValue::from_str(grant.csrf_token())
                .map_err(|_| HttpError(ServiceError::Unavailable))?,
        );
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        Ok(response)
    }
}
/// Builds relative auth routes; deployment composition mounts these under its configured base path.
pub fn router(transport: AuthTransport) -> Router {
    Router::new()
        .route("/api/v1/auth/register", post(register))
        .route("/api/v1/auth/local", post(local))
        .route("/api/v1/auth/session", get(session))
        .route("/api/v1/auth/oidc/start", post(oidc_start))
        .route("/api/v1/auth/oidc/callback", post(oidc_callback))
        .route("/api/v1/auth/bootstrap", post(bootstrap))
        .route("/api/v1/auth/logout", post(logout))
        .layer(DefaultBodyLimit::max(MAX_AUTH_BODY))
        .with_state(transport)
}
fn cookie<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut found = None;
    for header in headers.get_all(header::COOKIE) {
        for value in header.to_str().ok()?.split(';') {
            if let Some((key, value)) = value.trim().split_once('=')
                && key == name
            {
                if found.is_some() {
                    return None;
                }
                found = Some(value);
            }
        }
    }
    found
}
pub(crate) fn body<T: Wire>(headers: &HeaderMap, bytes: &Bytes) -> Result<T, HttpError> {
    if headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_none_or(|value| value.split(';').next() != Some("application/json"))
    {
        return Err(HttpError(ServiceError::Validation(
            ValidationErrors::field("$", "json_required"),
        )));
    }
    decode(bytes).map_err(|error| HttpError(ServiceError::Validation(error)))
}
async fn local(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Response, HttpError> {
    state.origin(&headers)?;
    state.grant(
        state
            .backend
            .login(body(&headers, &bytes)?)
            .await
            .map_err(|error| HttpError(ServiceError::Authentication(error)))?,
    )
}
async fn register(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Response, HttpError> {
    state.origin(&headers)?;
    let administrator = if cookie(&headers, SESSION_COOKIE).is_some() {
        Some(
            state
                .authenticate(&headers, true)
                .await
                .map_err(HttpError)?,
        )
    } else {
        None
    };
    let token = headers
        .get(SETUP_HEADER)
        .and_then(|value| value.to_str().ok());
    state.grant(
        state
            .backend
            .register(body(&headers, &bytes)?, administrator, token)
            .await
            .map_err(HttpError)?,
    )
}
async fn session(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
) -> Result<Response, HttpError> {
    let mut response = Json(
        state
            .authenticate(&headers, false)
            .await
            .map_err(HttpError)?,
    )
    .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}
async fn oidc_start(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Response, HttpError> {
    state.origin(&headers)?;
    let address = state
        .backend
        .start_oidc(body(&headers, &bytes)?)
        .await
        .map_err(|error| HttpError(ServiceError::Authentication(error)))?;
    let url = url::Url::parse(&address).map_err(|_| HttpError(ServiceError::Unavailable))?;
    let flow = url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned())
        .ok_or(HttpError(ServiceError::Unavailable))?;
    let mut response = Json(address).into_response();
    response.headers_mut().append(
        header::SET_COOKIE,
        state.cookie(FLOW_COOKIE, &flow, true, LOGIN_STATE_SECONDS as u64)?,
    );
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    Ok(response)
}
async fn oidc_callback(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Response, HttpError> {
    state.origin(&headers)?;
    let request: OidcCallback = body(&headers, &bytes)?;
    if cookie(&headers, FLOW_COOKIE) != Some(request.state.expose()) {
        return Err(HttpError(ServiceError::Authentication(
            AuthenticationError::InvalidCredentials,
        )));
    }
    let grant = state
        .backend
        .complete_oidc(request)
        .await
        .map_err(|error| HttpError(ServiceError::Authentication(error)))?;
    let mut response = state.grant(grant)?;
    response
        .headers_mut()
        .append(header::SET_COOKIE, state.cookie(FLOW_COOKIE, "", true, 0)?);
    Ok(response)
}
async fn bootstrap(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Json<ironloom_storage::factory::BootstrapState>, HttpError> {
    let session = state
        .authenticate(&headers, true)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .bootstrap(session, body(&headers, &bytes)?)
        .await
        .map(Json)
        .map_err(|error| HttpError(ServiceError::Authentication(error)))
}
async fn logout(
    State(state): State<AuthTransport>,
    headers: HeaderMap,
) -> Result<Response, HttpError> {
    let session = state
        .authenticate(&headers, true)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .logout(session)
        .await
        .map_err(|error| HttpError(ServiceError::Authentication(error)))?;
    let mut response = StatusCode::NO_CONTENT.into_response();
    for (name, http_only) in [
        (SESSION_COOKIE, true),
        (CSRF_COOKIE, false),
        (FLOW_COOKIE, true),
    ] {
        response
            .headers_mut()
            .append(header::SET_COOKIE, state.cookie(name, "", http_only, 0)?);
    }
    Ok(response)
}
pub(crate) struct HttpError(pub(crate) ServiceError);
impl IntoResponse for HttpError {
    fn into_response(self) -> Response {
        let status = match &self.0 {
            ServiceError::Validation(_) => StatusCode::BAD_REQUEST,
            ServiceError::Authentication(
                AuthenticationError::Unauthenticated | AuthenticationError::InvalidCredentials,
            ) => StatusCode::UNAUTHORIZED,
            ServiceError::Authentication(AuthenticationError::Unavailable)
            | ServiceError::Unavailable => StatusCode::SERVICE_UNAVAILABLE,
            ServiceError::Authentication(_) => StatusCode::FORBIDDEN,
            ServiceError::ApprovalRequired => StatusCode::PRECONDITION_REQUIRED,
            ServiceError::Conflict | ServiceError::CursorExpired | ServiceError::ResyncRequired => {
                StatusCode::CONFLICT
            }
        };
        let mut response = (status, Json(self.0)).into_response();
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        response
    }
}

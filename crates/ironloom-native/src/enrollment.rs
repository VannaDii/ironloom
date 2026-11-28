//! Direct native enrollment, token refresh and pairing HTTP. Credentials remain in trusted ports.
use ironloom_core::{BoxFuture, Counter, CredentialId, EnvironmentId, InstallationId, ServerId};
use ironloom_service::factory::{NativeEnrollment, RelayTarget};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{sync::Arc, time::Duration};

const MAX_RESPONSE: usize = 64 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// Redacted enrollment failure; a failed lookup never silently creates another registration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EnrollmentError {
    /// Current account authentication failed, including a retired import generation.
    Authentication,
    /// Retry after the server's exact seconds/date header; do not bypass with another account.
    Deferred(Option<String>),
    /// Only the pinned upstream missing-registration detail permits explicit reenrollment.
    MissingRegistration,
    /// Other 404s preserve current registration identity.
    NotFound,
    /// Malformed response or mismatched refreshed server/environment.
    Protocol,
    /// Network, credential-store or server unavailable.
    Unavailable,
}
/// Transient enrollment response, consumed by a protected service storage callback.
/// Deliberately has no Debug/Serialize implementation: control tokens must not enter logs or browsers.
pub struct Registration {
    /// Upstream server identity, distinct from the installation identity.
    pub server: ServerId,
    /// Upstream environment identity used for native visibility.
    pub environment: EnvironmentId,
    /// Protected relay bearer token; never an eligible inference credential.
    pub token: String,
    /// Upstream RFC3339 expiry, validated by the persistence callback before commit.
    pub expires_at: String,
}
/// Generation-bound protected account and registration operations supplied by the service.
pub trait RegistrationStore: Send + Sync {
    /// Applies account OAuth authorization and account header to the approved target only.
    /// With `recover=true`, refresh the imported account token once under a generation CAS;
    /// never adopt another operator/account or substitute an API key.
    fn account_request(
        &self,
        registration: CredentialId,
        generation: Counter,
        request: reqwest::RequestBuilder,
        recover: bool,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, EnrollmentError>>;
    /// Applies only the current remote-control token, checking enabled state and generation.
    fn control_request(
        &self,
        enrollment: NativeEnrollment,
        request: reqwest::RequestBuilder,
    ) -> BoxFuture<'_, Result<reqwest::RequestBuilder, EnrollmentError>>;
    /// Validates expiry and atomically commits protected tokens/enrollment iff this import generation
    /// is still current/enabled. A stale refresh may not overwrite a newer login or deletion.
    fn commit(
        &self,
        registration: CredentialId,
        generation: Counter,
        response: Registration,
    ) -> BoxFuture<'_, Result<NativeEnrollment, EnrollmentError>>;
}
#[derive(Deserialize)]
struct RawRegistration {
    server_id: ServerId,
    environment_id: EnvironmentId,
    remote_control_token: String,
    expires_at: String,
}
/// Pairing response. Codes are transient protected setup data, not session authority.
pub struct Pairing {
    /// Opaque pairing code from the upstream service.
    pub code: String,
    /// Optional human-entered code requested explicitly.
    pub manual_code: Option<String>,
    /// Expiry supplied by upstream.
    pub expires_at: String,
}
/// Native HTTP adapter. Construction performs no enrollment or inference.
pub struct NativeControl {
    client: reqwest::Client,
    store: Arc<dyn RegistrationStore>,
}
impl NativeControl {
    /// Uses bounded responses, fixed request deadline and no credential-forwarding redirects.
    pub fn new(store: Arc<dyn RegistrationStore>) -> Result<Self, EnrollmentError> {
        let client = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| EnrollmentError::Unavailable)?;
        Ok(Self { client, store })
    }
    async fn account(
        &self,
        endpoint: &str,
        installation: &InstallationId,
        registration: CredentialId,
        generation: Counter,
        body: Value,
    ) -> Result<Value, EnrollmentError> {
        for recover in [false, true] {
            let request = self
                .client
                .post(endpoint)
                .header("x-codex-installation-id", installation.as_str())
                .json(&body);
            let response = self
                .store
                .account_request(registration.clone(), generation, request, recover)
                .await?
                .send()
                .await
                .map_err(|_| EnrollmentError::Unavailable)?;
            if matches!(response.status().as_u16(), 401 | 403) && !recover {
                continue;
            }
            return bounded(response).await;
        }
        Err(EnrollmentError::Authentication)
    }
    /// Enrolls the protected imported account. Service storage supplies the existing node/owner mapping.
    pub async fn enroll(
        &self,
        target: &RelayTarget,
        installation: InstallationId,
        registration: CredentialId,
        generation: Counter,
        name: &str,
    ) -> Result<NativeEnrollment, EnrollmentError> {
        if generation.get() == 0 || name.trim().is_empty() || name.len() > 1024 {
            return Err(EnrollmentError::Protocol);
        }
        let body = json!({"name":name,"os":std::env::consts::OS,"arch":std::env::consts::ARCH,"app_server_version":env!("CARGO_PKG_VERSION"),"installation_id":installation});
        let value = self
            .account(
                &target.enroll_url,
                &installation,
                registration.clone(),
                generation,
                body,
            )
            .await?;
        self.store
            .commit(registration, generation, registration_response(value)?)
            .await
    }
    /// Refreshes only the same upstream server/environment, retaining identity on unrelated failures.
    /// Call before expiry (the pinned upstream uses a five-minute refresh margin).
    pub async fn refresh(
        &self,
        enrollment: NativeEnrollment,
    ) -> Result<NativeEnrollment, EnrollmentError> {
        if !enrollment.enabled {
            return Err(EnrollmentError::Authentication);
        }
        let value=self.account(&enrollment.relay_target.refresh_url,&enrollment.installation_id,enrollment.control_registration_ref.clone(),enrollment.authentication_generation,json!({"server_id":enrollment.server_id,"installation_id":enrollment.installation_id})).await?;
        let response = registration_response(value)?;
        if response.server != enrollment.server_id
            || response.environment != enrollment.environment_id
        {
            return Err(EnrollmentError::Protocol);
        }
        self.store
            .commit(
                enrollment.control_registration_ref.clone(),
                enrollment.authentication_generation,
                response,
            )
            .await
    }
    /// Explicit native-client pairing; manual codes are requested only when selected by the operator.
    pub async fn pair(
        &self,
        enrollment: NativeEnrollment,
        manual: bool,
    ) -> Result<Pairing, EnrollmentError> {
        let request = self
            .client
            .post(&enrollment.relay_target.pair_url)
            .json(&json!({"manual_code":manual}));
        let value = bounded(
            self.store
                .control_request(enrollment.clone(), request)
                .await?
                .send()
                .await
                .map_err(|_| EnrollmentError::Unavailable)?,
        )
        .await?;
        if value["server_id"] != enrollment.server_id.as_str()
            || value["environment_id"] != enrollment.environment_id.as_str()
        {
            return Err(EnrollmentError::Protocol);
        }
        let code = nonempty(&value, "pairing_code")?;
        let expires_at = nonempty(&value, "expires_at")?;
        Ok(Pairing {
            code,
            expires_at,
            manual_code: value["manual_pairing_code"].as_str().map(str::to_owned),
        })
    }
    /// Checks claim state for exactly one issued pairing code, without enrolling another server.
    pub async fn pairing_status(
        &self,
        enrollment: NativeEnrollment,
        code: &str,
        manual: bool,
    ) -> Result<bool, EnrollmentError> {
        if code.is_empty() || code.len() > MAX_RESPONSE {
            return Err(EnrollmentError::Protocol);
        }
        let body = if manual {
            json!({"manual_pairing_code":code})
        } else {
            json!({"pairing_code":code})
        };
        let request = self
            .client
            .post(&enrollment.relay_target.pair_status_url)
            .json(&body);
        let value = bounded(
            self.store
                .control_request(enrollment, request)
                .await?
                .send()
                .await
                .map_err(|_| EnrollmentError::Unavailable)?,
        )
        .await?;
        value["claimed"].as_bool().ok_or(EnrollmentError::Protocol)
    }
}
fn nonempty(value: &Value, key: &str) -> Result<String, EnrollmentError> {
    value[key]
        .as_str()
        .filter(|s| !s.trim().is_empty())
        .map(str::to_owned)
        .ok_or(EnrollmentError::Protocol)
}
fn registration_response(value: Value) -> Result<Registration, EnrollmentError> {
    let value: RawRegistration =
        serde_json::from_value(value).map_err(|_| EnrollmentError::Protocol)?;
    if value.remote_control_token.trim().is_empty() || value.expires_at.trim().is_empty() {
        return Err(EnrollmentError::Protocol);
    }
    Ok(Registration {
        server: value.server_id,
        environment: value.environment_id,
        token: value.remote_control_token,
        expires_at: value.expires_at,
    })
}
async fn bounded(mut response: reqwest::Response) -> Result<Value, EnrollmentError> {
    let status = response.status();
    if matches!(status.as_u16(), 401 | 403) {
        return Err(EnrollmentError::Authentication);
    }
    if matches!(status.as_u16(), 429 | 503) {
        return Err(EnrollmentError::Deferred(
            response
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .filter(|s| s.len() <= 128)
                .map(str::to_owned),
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| EnrollmentError::Unavailable)?
    {
        if bytes.len() + chunk.len() > MAX_RESPONSE {
            return Err(EnrollmentError::Protocol);
        }
        bytes.extend(chunk);
    }
    let value: Value = serde_json::from_slice(&bytes).map_err(|_| {
        if status.as_u16() == 404 {
            EnrollmentError::NotFound
        } else {
            EnrollmentError::Protocol
        }
    })?;
    if status.as_u16() == 404 {
        return Err(if value["detail"] == "Remote app server not found" {
            EnrollmentError::MissingRegistration
        } else {
            EnrollmentError::NotFound
        });
    }
    if !status.is_success() {
        return Err(EnrollmentError::Unavailable);
    }
    Ok(value)
}

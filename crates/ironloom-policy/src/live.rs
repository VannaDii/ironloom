//! Current OpenFGA grant checks. Denied, dependency failure and approval requirements stay distinct.
use crate::factory::{AuthorityCheck, AuthorizationOutcome, Permission, Resource, ResourceKind};
use ironloom_core::{BoxFuture, OperatorId};
use serde::Serialize;
use serde_json::{Value, json};
use std::time::Duration;
use thiserror::Error;

const HTTP_TIMEOUT: Duration = Duration::from_secs(10);
const RELATION_TYPES: &[&str] = &[
    "operator",
    "worker",
    "installation",
    "project",
    "assignment",
    "conversation",
    "file",
    "credential",
    "lesson",
    "node",
];
/// Redacted authorization transport or relationship validation failure.
#[derive(Clone, Debug, Eq, PartialEq, Error)]
pub enum AuthorizationError {
    /// OpenFGA could not establish current authority; no action may dispatch.
    #[error("authorization unavailable")]
    Unavailable,
    /// A relationship has an unknown type or invalid identity/relation syntax.
    #[error("invalid authorization relationship")]
    InvalidRelationship,
}
/// Immutable relationship key, constructed only from validated server-resolved identities.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct Relationship {
    user: String,
    relation: String,
    object: String,
}
impl Relationship {
    /// Validates a canonical subject, relation and actual resource before serialization.
    pub fn new(
        user: impl Into<String>,
        relation: impl Into<String>,
        object: impl Into<String>,
    ) -> Result<Self, AuthorizationError> {
        let value = Self {
            user: user.into(),
            relation: relation.into(),
            object: object.into(),
        };
        let valid = |text: &str, wildcard: bool| {
            text.split_once(':').is_some_and(|(kind, id)| {
                RELATION_TYPES.contains(&kind)
                    && !id.is_empty()
                    && (wildcard && kind == "operator" && id == "*"
                        || id.chars().all(|c| {
                            c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/')
                        }))
            })
        };
        if !valid(&value.user, true)
            || !valid(&value.object, false)
            || value.relation.is_empty()
            || !value
                .relation
                .chars()
                .all(|c| c.is_ascii_lowercase() || c == '_')
        {
            return Err(AuthorizationError::InvalidRelationship);
        }
        Ok(value)
    }
}
/// Trusted authorization port. Implementations resolve the installation's coordinated model binding.
pub trait Authority: Send + Sync {
    /// Checks current human grants and worker delegation with higher consistency at dispatch.
    fn check(&self, request: AuthorityCheck) -> BoxFuture<'_, AuthorizationOutcome>;
    /// Applies already-authorized/audited relationship intents; callers cannot supply arbitrary grants.
    fn write(
        &self,
        writes: Vec<Relationship>,
        deletes: Vec<Relationship>,
    ) -> BoxFuture<'_, Result<(), AuthorizationError>>;
    /// Initializes/retries grants for the persisted sole bootstrap administrator, never another account.
    fn bootstrap(&self, operator: OperatorId) -> BoxFuture<'_, Result<(), AuthorizationError>>;
}
/// Thin OpenFGA HTTP transport. Storage/model initialization remains runtime orchestration.
#[derive(Clone)]
pub struct OpenFga {
    client: reqwest::Client,
    base: String,
    bearer: Option<String>,
}
impl OpenFga {
    /// Creates a bounded client for an infrastructure-configured private or TLS-protected endpoint.
    pub fn new(
        base: impl Into<String>,
        bearer: Option<String>,
    ) -> Result<Self, AuthorizationError> {
        let base = base.into();
        let url = url_check(&base)?;
        let client = reqwest::Client::builder()
            .timeout(HTTP_TIMEOUT)
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| AuthorizationError::Unavailable)?;
        Ok(Self {
            client,
            base: url,
            bearer,
        })
    }
    fn request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let request = self
            .client
            .request(method, format!("{}{}", self.base, path));
        if let Some(token) = &self.bearer {
            request.bearer_auth(token)
        } else {
            request
        }
    }
    /// Creates only the installation's initial authorization store.
    pub async fn create_store(&self, name: &str) -> Result<String, AuthorizationError> {
        let response = self
            .request(reqwest::Method::POST, "/stores")
            .json(&json!({"name":name}))
            .send()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        let value: Value = response
            .error_for_status()
            .map_err(|_| AuthorizationError::Unavailable)?
            .json()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        value
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| valid_id(id))
            .map(str::to_owned)
            .ok_or(AuthorizationError::Unavailable)
    }
    /// Finds a store by installation-specific name for interrupted initial-store recovery.
    pub async fn find_store(&self, name: &str) -> Result<Option<String>, AuthorizationError> {
        let mut continuation = String::new();
        let mut found = None;
        let mut seen = std::collections::BTreeSet::new();
        loop {
            let response = self
                .request(reqwest::Method::GET, "/stores")
                .query(&[("page_size", "100"), ("continuation_token", &continuation)])
                .send()
                .await
                .map_err(|_| AuthorizationError::Unavailable)?;
            let value: Value = response
                .error_for_status()
                .map_err(|_| AuthorizationError::Unavailable)?
                .json()
                .await
                .map_err(|_| AuthorizationError::Unavailable)?;
            if let Some(stores) = value.get("stores").and_then(Value::as_array) {
                for store in stores {
                    if store.get("name").and_then(Value::as_str) == Some(name) {
                        let id = store
                            .get("id")
                            .and_then(Value::as_str)
                            .filter(|id| valid_id(id))
                            .ok_or(AuthorizationError::Unavailable)?;
                        if found.replace(id.to_owned()).is_some() {
                            return Err(AuthorizationError::Unavailable);
                        }
                    }
                }
            }
            continuation = value
                .get("continuation_token")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned();
            if !continuation.is_empty() && !seen.insert(continuation.clone()) {
                return Err(AuthorizationError::Unavailable);
            }
            if continuation.is_empty() {
                return Ok(found);
            }
        }
    }
    /// Writes the current initial authorization model; this is not an old-model upgrade path.
    pub async fn create_model(
        &self,
        store: &str,
        model: &Value,
    ) -> Result<String, AuthorizationError> {
        if !valid_id(store) {
            return Err(AuthorizationError::InvalidRelationship);
        }
        let response = self
            .request(
                reqwest::Method::POST,
                &format!("/stores/{store}/authorization-models"),
            )
            .json(model)
            .send()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        let value: Value = response
            .error_for_status()
            .map_err(|_| AuthorizationError::Unavailable)?
            .json()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        value
            .get("authorization_model_id")
            .and_then(Value::as_str)
            .filter(|id| valid_id(id))
            .map(str::to_owned)
            .ok_or(AuthorizationError::Unavailable)
    }
    /// Checks one actual tuple against the current model, explicitly bypassing stale result caches.
    pub async fn check(
        &self,
        store: &str,
        model: &str,
        tuple: &Relationship,
    ) -> Result<bool, AuthorizationError> {
        if !valid_id(store) || !valid_id(model) {
            return Err(AuthorizationError::InvalidRelationship);
        }
        let response=self.request(reqwest::Method::POST,&format!("/stores/{store}/check")).json(&json!({"authorization_model_id":model,"tuple_key":tuple,"consistency":"HIGHER_CONSISTENCY"})).send().await.map_err(|_|AuthorizationError::Unavailable)?;
        let value: Value = response
            .error_for_status()
            .map_err(|_| AuthorizationError::Unavailable)?
            .json()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        value
            .get("allowed")
            .and_then(Value::as_bool)
            .ok_or(AuthorizationError::Unavailable)
    }
    /// Idempotently writes/deletes audited relationships using current upstream duplicate semantics.
    pub async fn write(
        &self,
        store: &str,
        model: &str,
        writes: &[Relationship],
        deletes: &[Relationship],
    ) -> Result<(), AuthorizationError> {
        if !valid_id(store) || !valid_id(model) {
            return Err(AuthorizationError::InvalidRelationship);
        }
        if writes.is_empty() && deletes.is_empty() {
            return Ok(());
        }
        let mut body = json!({"authorization_model_id":model});
        if !writes.is_empty() {
            body["writes"] = json!({"tuple_keys":writes,"on_duplicate":"ignore"});
        }
        if !deletes.is_empty() {
            body["deletes"] = json!({"tuple_keys":deletes,"on_missing":"ignore"});
        }
        self.request(reqwest::Method::POST, &format!("/stores/{store}/write"))
            .json(&body)
            .send()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?
            .error_for_status()
            .map_err(|_| AuthorizationError::Unavailable)?;
        Ok(())
    }
    /// Evaluates operator access then explicit worker delegation, without granting access on errors.
    pub async fn authorize(
        &self,
        store: &str,
        model: &str,
        request: &AuthorityCheck,
    ) -> AuthorizationOutcome {
        let resource = resource_object(&request.resource);
        let Ok(tuple) = Relationship::new(
            format!("operator:{}", request.operator_id.as_str()),
            request.permission.relation(),
            resource,
        ) else {
            return AuthorizationOutcome::Denied;
        };
        match self.check(store, model, &tuple).await {
            Ok(false) => return AuthorizationOutcome::Denied,
            Err(_) => return AuthorizationOutcome::Unavailable,
            Ok(true) => {}
        }
        if let (Some(worker), Some(assignment)) = (&request.worker_id, &request.assignment_id) {
            let Ok(tuple) = Relationship::new(
                format!("worker:{}", worker.as_str()),
                "delegated",
                format!("assignment:{}", assignment.as_str()),
            ) else {
                return AuthorizationOutcome::Denied;
            };
            match self.check(store, model, &tuple).await {
                Ok(true) => {}
                Ok(false) => return AuthorizationOutcome::Denied,
                Err(_) => return AuthorizationOutcome::Unavailable,
            }
        }
        AuthorizationOutcome::Allowed
    }
}
impl Permission {
    /// Maps the selected public permission to its exact current OpenFGA relation.
    pub const fn relation(&self) -> &'static str {
        match self {
            Self::View => "view",
            Self::Operate => "operate",
            Self::Approve => "approve",
            Self::Manage => "manage",
            Self::Share => "share",
            Self::UseCredential => "use_credential",
            Self::ReplaceCredential => "replace_credential",
            Self::DeleteCredential => "delete_credential",
            Self::EnrollNode => "enroll_node",
            Self::SelfGrant => "self_grant",
        }
    }
}
/// Returns the canonical OpenFGA object name for a server-resolved resource.
pub fn resource_object(resource: &Resource) -> String {
    let kind = match resource.kind {
        ResourceKind::Installation => "installation",
        ResourceKind::Project => "project",
        ResourceKind::Assignment => "assignment",
        ResourceKind::Conversation => "conversation",
        ResourceKind::File => "file",
        ResourceKind::Credential => "credential",
        ResourceKind::Lesson => "lesson",
        ResourceKind::Node => "node",
    };
    format!("{kind}:{}", resource.id.as_str())
}
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}
fn url_check(base: &str) -> Result<String, AuthorizationError> {
    // Infrastructure owns this endpoint; browsers and workers never supply it.
    let url = reqwest::Url::parse(base).map_err(|_| AuthorizationError::Unavailable)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(AuthorizationError::Unavailable);
    }
    Ok(base.trim_end_matches('/').to_owned())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn relationship_validation_rejects_subject_injection_and_keeps_credential_authority_distinct() {
        assert!(Relationship::new("operator:human", "use_credential", "credential:key").is_ok());
        assert!(Relationship::new("operator:human#owner", "owner", "credential:key").is_err());
        assert!(Relationship::new("operator:*", "viewer", "lesson:shared").is_ok());
        assert!(Relationship::new("operator:human", "owner", "credential:*").is_err());
        assert_ne!(
            Permission::UseCredential.relation(),
            Permission::ReplaceCredential.relation()
        );
        assert_ne!(
            Permission::Share.relation(),
            Permission::DeleteCredential.relation()
        );
    }
}

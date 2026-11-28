//! Live authorization composition. PostgreSQL coordinates one current OpenFGA binding per installation.
use crate::authentication::model_revision;
use ironloom_core::{BoxFuture, OperatorId};
use ironloom_policy::{
    factory::{AuthorityCheck, AuthorizationOutcome},
    live::{Authority, AuthorizationError, OpenFga, Relationship},
};
use ironloom_storage::postgres::Store;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Eq, PartialEq)]
struct Binding {
    store: String,
    model: String,
    contract: String,
}
/// Installation-bound higher-consistency authorization client; never trusts client-selected model IDs.
pub struct LiveAuthority {
    database: Store,
    client: OpenFga,
    binding: Binding,
    installation: String,
}
impl LiveAuthority {
    /// Opens the existing binding, or initializes the fresh installation once under a shared lock.
    /// A different contract or unavailable dependency fails closed; there is no model upgrade path.
    pub async fn open(database: Store, client: OpenFga) -> Result<Self, AuthorizationError> {
        let (installation, administrator, initialized) = database
            .installation()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        let initialization = database
            .authorization_initialization()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        let binding = if let Some(value) = initialization.binding() {
            let binding: Binding = serde_json::from_value(value.clone())
                .map_err(|_| AuthorizationError::Unavailable)?;
            if binding.contract != model_revision().as_str() {
                return Err(AuthorizationError::Unavailable);
            }
            binding
        } else {
            if administrator.is_some() || initialized {
                return Err(AuthorizationError::Unavailable);
            }
            let name = format!("ironloom-{}", installation.as_str());
            let store = match client.find_store(&name).await? {
                Some(id) => id,
                None => client.create_store(&name).await?,
            };
            let model = client
                .create_model(
                    &store,
                    &serde_json::from_str(include_str!(
                        "../../ironloom-policy/authorization-model.json"
                    ))
                    .map_err(|_| AuthorizationError::Unavailable)?,
                )
                .await?;
            Binding {
                store,
                model,
                contract: model_revision().as_str().to_owned(),
            }
        };
        initialization
            .commit(&serde_json::to_value(&binding).map_err(|_| AuthorizationError::Unavailable)?)
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        Ok(Self {
            database,
            client,
            binding,
            installation: installation.as_str().to_owned(),
        })
    }
    /// Checks selected PostgreSQL identity/current binding and actual OpenFGA availability,
    /// independently of model/team setup. Missing records never initialize a replacement.
    pub async fn ready(&self) -> Result<(), AuthorizationError> {
        let (installation, _, _) = self
            .database
            .installation()
            .await
            .map_err(|_| AuthorizationError::Unavailable)?;
        if installation.as_str() != self.installation {
            return Err(AuthorizationError::Unavailable);
        }
        let id =
            ironloom_core::ActorId::new("binding").map_err(|_| AuthorizationError::Unavailable)?;
        let record = self
            .database
            .get("authorization", &id)
            .await
            .map_err(|_| AuthorizationError::Unavailable)?
            .ok_or(AuthorizationError::Unavailable)?;
        let current: Binding =
            serde_json::from_value(record.body).map_err(|_| AuthorizationError::Unavailable)?;
        if current != self.binding || current.contract != model_revision().as_str() {
            return Err(AuthorizationError::Unavailable);
        }
        self.client
            .binding_available(&self.binding.store, &self.binding.model)
            .await
    }
}
impl Authority for LiveAuthority {
    fn check(&self, request: AuthorityCheck) -> BoxFuture<'_, AuthorizationOutcome> {
        Box::pin(async move {
            if request.authorization_model.as_str() != self.binding.contract {
                return AuthorizationOutcome::Unavailable;
            }
            self.client
                .authorize(&self.binding.store, &self.binding.model, &request)
                .await
        })
    }
    fn write(
        &self,
        writes: Vec<Relationship>,
        deletes: Vec<Relationship>,
    ) -> BoxFuture<'_, Result<(), AuthorizationError>> {
        Box::pin(async move {
            self.client
                .write(&self.binding.store, &self.binding.model, &writes, &deletes)
                .await
        })
    }
    fn bootstrap(&self, operator: OperatorId) -> BoxFuture<'_, Result<(), AuthorizationError>> {
        Box::pin(async move {
            let initialization = self
                .database
                .bootstrap_initialization(&operator)
                .await
                .map_err(|_| AuthorizationError::Unavailable)?;
            if !initialization.initialized() {
                self.write(
                    vec![Relationship::new(
                        format!("operator:{}", operator.as_str()),
                        "administrator",
                        format!("installation:{}", self.installation),
                    )?],
                    vec![],
                )
                .await?;
            }
            initialization
                .complete()
                .await
                .map_err(|_| AuthorizationError::Unavailable)
        })
    }
}

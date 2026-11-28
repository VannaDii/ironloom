//! Live authorization composition. PostgreSQL coordinates one current OpenFGA binding per installation.
use crate::authentication::model_revision;
use ironloom_core::{BoxFuture, OperatorId};
use ironloom_policy::{
    factory::{AuthorityCheck, AuthorizationOutcome},
    live::{Authority, AuthorizationError, OpenFga, Relationship},
};
use ironloom_storage::postgres::Store;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
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
        let (installation, _, _) = database
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
            let (_, administrator, initialized) = self
                .database
                .installation()
                .await
                .map_err(|_| AuthorizationError::Unavailable)?;
            if administrator.as_ref() != Some(&operator) {
                return Err(AuthorizationError::InvalidRelationship);
            }
            if initialized {
                return Ok(());
            }
            self.write(
                vec![Relationship::new(
                    format!("operator:{}", operator.as_str()),
                    "administrator",
                    format!("installation:{}", self.installation),
                )?],
                vec![],
            )
            .await
        })
    }
}

//! Credential-use grants never authorize sending a shared secret to a newly selected destination.
use super::*;
use ironloom_config::factory::SourceAccountAccess;

fn destinations(
    configuration: &ConfigurationSnapshot,
) -> Result<BTreeSet<(CredentialId, String)>, ServiceError> {
    let mut selected = BTreeSet::new();
    for profile in configuration
        .models
        .iter()
        .filter(|profile| profile.engine.is_none())
    {
        let Some(credential) = &profile.credential_id else {
            continue;
        };
        let Some(endpoint) = configuration.endpoints.iter().find(|endpoint| {
            endpoint.provider == profile.provider && endpoint.billing == profile.billing
        }) else {
            continue;
        };
        let base = url::Url::parse(&endpoint.base).map_err(|_| ServiceError::Unavailable)?;
        let destination = serde_json::to_string(&(
            "provider",
            &endpoint.provider,
            base.as_str(),
            endpoint.dialect,
            &endpoint.billing,
        ))
        .map_err(|_| ServiceError::Unavailable)?;
        selected.insert((credential.clone(), destination));
    }
    for account in &configuration.source_accounts {
        if let SourceAccountAccess::Credential(credential) = &account.access {
            let destination = serde_json::to_string(&("source", &account.host))
                .map_err(|_| ServiceError::Unavailable)?;
            selected.insert((credential.clone(), destination));
        }
    }
    Ok(selected)
}

impl FactoryBackend {
    pub(super) async fn authorize_destination_changes(
        &self,
        operator: &OperatorId,
        before: &ConfigurationSnapshot,
        after: &ConfigurationSnapshot,
    ) -> Result<(), ServiceError> {
        let previous = destinations(before)?;
        let next = destinations(after)?;
        let credentials = next
            .difference(&previous)
            .map(|(credential, _)| credential)
            .collect::<BTreeSet<_>>();
        for credential in credentials {
            self.require(
                operator,
                Resource::new(ResourceData {
                    kind: ResourceKind::Credential,
                    id: actor(credential.as_str())?,
                    project_id: None,
                })
                .map_err(ServiceError::Validation)?,
                Permission::ReplaceCredential,
            )
            .await?;
        }
        Ok(())
    }
}

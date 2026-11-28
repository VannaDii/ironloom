//! Pure effective-configuration composition. Runtime supplies current authorized adapter/storage facts.
use crate::factory::{ConfigurationChange, ConfigurationSnapshot, ConfigurationSnapshotData};
use ironloom_config::{
    factory::RoleConfiguration,
    team::{ReadinessFacts, standard_team, unmet_prerequisites},
};
use ironloom_core::{Counter, ProjectId, validation::ValidationErrors};
use ironloom_models::factory::DeviceIdentity;

/// Builds the effective snapshot without mutating templates, copied instructions or active selections.
/// Project changes inherit unmodified installation fields; the setup choice remains installation-wide.
pub fn effective_snapshot(
    project: Option<ProjectId>,
    revision: Counter,
    base: Option<&ConfigurationSnapshot>,
    changes: Option<&ConfigurationChange>,
    devices: Vec<DeviceIdentity>,
    facts: &ReadinessFacts<'_>,
) -> Result<ConfigurationSnapshot, ValidationErrors> {
    let setup = changes
        .and_then(|change| change.setup.clone())
        .or_else(|| base.and_then(|base| base.setup.clone()));
    let roles = changes
        .and_then(|change| change.roles.clone())
        .or_else(|| base.map(|base| base.roles.clone()))
        .unwrap_or_else(|| {
            standard_team()
                .iter()
                .map(|role| role.unconfigured())
                .collect::<Vec<RoleConfiguration>>()
        });
    let models = changes
        .and_then(|change| change.models.clone())
        .or_else(|| base.map(|base| base.models.clone()))
        .unwrap_or_default();
    let device_preferences = changes
        .and_then(|change| change.device_preferences.clone())
        .or_else(|| base.map(|base| base.device_preferences.clone()))
        .unwrap_or_default();
    let blockers = unmet_prerequisites(setup.as_ref(), &roles, &models, facts);
    ConfigurationSnapshot::new(ConfigurationSnapshotData {
        project_id: project,
        revision,
        setup,
        roles,
        models,
        device_preferences,
        discovered_devices: devices,
        execution_ready: blockers.is_empty(),
        unmet_prerequisites: blockers,
    })
}
/// Combines only explicitly changed override fields. Missing project fields keep inheritance live.
pub fn merge_overrides(
    previous: Option<&ConfigurationChange>,
    change: &ConfigurationChange,
) -> Result<ConfigurationChange, ValidationErrors> {
    use crate::factory::ConfigurationChangeData;
    ConfigurationChange::new(ConfigurationChangeData {
        setup: change
            .setup
            .clone()
            .or_else(|| previous.and_then(|value| value.setup.clone())),
        roles: change
            .roles
            .clone()
            .or_else(|| previous.and_then(|value| value.roles.clone())),
        models: change
            .models
            .clone()
            .or_else(|| previous.and_then(|value| value.models.clone())),
        device_preferences: change
            .device_preferences
            .clone()
            .or_else(|| previous.and_then(|value| value.device_preferences.clone())),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::factory::{ConfigurationChangeData, ConfigurationSnapshot};
    use ironloom_core::ModelProfileId;
    use std::collections::BTreeSet;
    #[test]
    fn remote_only_explicit_team_is_ready_without_any_gpu() {
        let profile = ModelProfileId::new("remote-profile").unwrap();
        let available = BTreeSet::from([profile]);
        let facts = ReadinessFacts {
            usable_profiles: &available,
            workspace_available: true,
            sandbox_available: true,
            node_enrolled: true,
        };
        let base:ConfigurationSnapshot=serde_json::from_value(serde_json::json!({
            "project_id":null,"revision":"1","setup":{"lesson_handling":"project_only","delivery_confirmed":true,"publish_branch":true,"merge":false,"deploy":false},
            "roles":[{"role_id":"planner","enabled":true,"model_profile_id":"remote-profile","reasoning_applicable":true,"reasoning_effort":"medium","device_bindings":[],"instructions_id":"planner"}],
            "models":[{"profile_id":"remote-profile","provider":"fixture-provider","model_id":"explicit-model","generation_controls":{"max_output_tokens":"100","max_duration_ms":"1000","repetition_window":"20"},"credential_id":null,"billing":"api_key","engine":null,"device_bindings":[]}],
            "device_preferences":[],"discovered_devices":[],"execution_ready":true,"unmet_prerequisites":[]
        })).unwrap();
        let change = ConfigurationChange::new(ConfigurationChangeData {
            setup: None,
            roles: None,
            models: None,
            device_preferences: Some(vec![]),
        })
        .unwrap();
        let project = effective_snapshot(
            Some(ProjectId::new("project").unwrap()),
            Counter::new(2),
            Some(&base),
            Some(&change),
            vec![],
            &facts,
        )
        .unwrap();
        assert!(project.execution_ready);
        assert!(project.discovered_devices.is_empty());
        assert_eq!(project.roles, base.roles);
        assert_eq!(project.models, base.models);
        let merged = merge_overrides(None, &change).unwrap();
        assert!(merged.roles.is_none());
        assert!(merged.models.is_none());
    }
    #[test]
    fn missing_enforcement_blocks_execution_without_blocking_setup_snapshot() {
        let available = BTreeSet::new();
        let snapshot = effective_snapshot(
            None,
            Counter::new(1),
            None,
            None,
            vec![],
            &ReadinessFacts {
                usable_profiles: &available,
                workspace_available: true,
                sandbox_available: false,
                node_enrolled: false,
            },
        )
        .unwrap();
        assert!(!snapshot.execution_ready);
        assert_eq!(snapshot.roles.len(), 7);
        assert!(
            snapshot
                .unmet_prerequisites
                .iter()
                .any(|reason| reason.as_str() == "sandbox_unavailable")
        );
        assert!(snapshot.setup.is_none());
    }
}

//! Pure routing for a new concept under the configured standard/customizable team.
use ironloom_config::factory::RoleConfiguration;
use ironloom_core::{ORCHESTRATOR_ROLE_ID, PRODUCT_MANAGER_ROLE_ID};

/// Uses the explicitly enabled coordinator when configured, otherwise the shipped concept role.
/// Other enabled roles are never substituted, and this does not add a global readiness/setup gate.
/// Custom behavior belongs to the selected role's editable instructions.
pub fn concept_role(roles: &[RoleConfiguration]) -> Option<&RoleConfiguration> {
    [ORCHESTRATOR_ROLE_ID, PRODUCT_MANAGER_ROLE_ID]
        .into_iter()
        .find_map(|id| {
            roles
                .iter()
                .find(|role| role.enabled && role.role_id.as_str() == id)
        })
}
#[cfg(test)]
mod tests {
    use super::*;
    use ironloom_config::team::standard_team;
    use ironloom_core::ModelProfileId;
    #[test]
    fn enabled_coordination_is_optional_and_unrelated_roles_are_never_substituted() {
        let mut roles = standard_team()
            .iter()
            .map(|role| role.unconfigured())
            .collect::<Vec<_>>();
        assert!(concept_role(&roles).is_none());
        for id in ["tester", PRODUCT_MANAGER_ROLE_ID, ORCHESTRATOR_ROLE_ID] {
            let role = roles
                .iter_mut()
                .find(|role| role.role_id.as_str() == id)
                .unwrap();
            let mut draft = (**role).clone();
            draft.enabled = true;
            draft.model_profile_id = Some(ModelProfileId::new(format!("{id}-selected")).unwrap());
            *role = RoleConfiguration::new(draft).unwrap();
            assert_eq!(
                concept_role(&roles).map(|role| role.role_id.as_str()),
                match id {
                    "tester" => None,
                    PRODUCT_MANAGER_ROLE_ID => Some(PRODUCT_MANAGER_ROLE_ID),
                    _ => Some(ORCHESTRATOR_ROLE_ID),
                }
            );
        }
    }
}

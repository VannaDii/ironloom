//! Editable shipped behavior and pure readiness rules. Infrastructure and adapters supply facts.
use crate::factory::{
    DevicePreference, FactorySetup, ModelProfileConfiguration, RoleConfiguration,
    RoleConfigurationData,
};
use ironloom_core::{ActorId, DeviceId, InstructionId, ModelProfileId};
use ironloom_models::factory::DeviceIdentity;
use std::collections::BTreeSet;

/// One shipped role's editable initial instructions; no inference model is preselected.
pub struct StandardRole {
    /// Stable role identity.
    pub role_id: ActorId,
    /// Stable template identity for assignment copies.
    pub instruction_id: InstructionId,
    /// Initial behavior, editable through the authorized instruction-template API.
    pub instructions: &'static str,
}
impl StandardRole {
    /// Returns a disabled role requiring explicit model/effort configuration before activation.
    pub fn unconfigured(&self) -> RoleConfiguration {
        RoleConfiguration::new(RoleConfigurationData {
            role_id: self.role_id.clone(),
            enabled: false,
            model_profile_id: None,
            reasoning_applicable: false,
            reasoning_effort: None,
            device_bindings: vec![],
            instructions_id: self.instruction_id.clone(),
        })
        .expect("shipped disabled role has no inferred model or placement")
    }
}
/// Returns the standard team plus optional orchestration role, all without default model selection.
pub fn standard_team() -> Vec<StandardRole> {
    [
        (
            "product-manager",
            include_str!("../roles/product-manager.md"),
        ),
        ("planner", include_str!("../roles/planner.md")),
        ("orchestrator", include_str!("../roles/orchestrator.md")),
        ("implementor", include_str!("../roles/implementor.md")),
        ("tester", include_str!("../roles/tester.md")),
        ("reviewer", include_str!("../roles/reviewer.md")),
        (
            "documentation-writer",
            include_str!("../roles/documentation-writer.md"),
        ),
    ]
    .into_iter()
    .map(|(id, instructions)| StandardRole {
        role_id: ActorId::new(id).expect("static role identity"),
        instruction_id: InstructionId::new(id).expect("static instruction identity"),
        instructions,
    })
    .collect()
}
/// Current trusted readiness observations. Presence in a set never grants dispatch authority.
pub struct ReadinessFacts<'a> {
    /// Profiles whose explicit adapter/credential/placement requirements are currently usable.
    pub usable_profiles: &'a BTreeSet<ModelProfileId>,
    /// Owning workspace is reachable; missing mounts are never recreated here.
    pub workspace_available: bool,
    /// Required process/filesystem enforcement is available on the owning node.
    pub sandbox_available: bool,
    /// Owning service node is enrolled in the existing installation.
    pub node_enrolled: bool,
}
/// Computes visible execution blockers separately from web/database health, without I/O or fallback.
/// Remote-only profiles have no GPU prerequisite; local profile admission is supplied as a fact.
pub fn unmet_prerequisites(
    setup: Option<&FactorySetup>,
    roles: &[RoleConfiguration],
    profiles: &[ModelProfileConfiguration],
    preferences: &[DevicePreference],
    devices: &[DeviceIdentity],
    facts: &ReadinessFacts<'_>,
) -> Vec<ActorId> {
    let mut reasons = BTreeSet::new();
    if setup.is_none() {
        reasons.insert("setup_required".to_owned());
    }
    if !facts.workspace_available {
        reasons.insert("workspace_unavailable".to_owned());
    }
    if !facts.sandbox_available {
        reasons.insert("sandbox_unavailable".to_owned());
    }
    if !facts.node_enrolled {
        reasons.insert("node_enrollment_required".to_owned());
    }
    if !roles.iter().any(|role| role.enabled) {
        reasons.insert("team_configuration_required".to_owned());
    }
    for role in roles.iter().filter(|role| role.enabled) {
        if role.model_profile_id.as_ref().is_none_or(|id| {
            !profiles.iter().any(|profile| &profile.profile_id == id)
                || !facts.usable_profiles.contains(id)
        }) {
            reasons.insert(format!("role:{}:model_unavailable", role.role_id.as_str()));
        }
        if let Some(profile) = profiles
            .iter()
            .find(|profile| Some(&profile.profile_id) == role.model_profile_id.as_ref())
        {
            let invalid = if profile.engine.is_some() {
                permitted_devices(profile, Some(role), preferences, devices).is_empty()
            } else {
                !role.device_bindings.is_empty()
            };
            if invalid {
                reasons.insert(format!(
                    "role:{}:placement_unavailable",
                    role.role_id.as_str()
                ));
            }
        }
    }
    reasons
        .into_iter()
        .map(|reason| ActorId::new(reason).expect("service-owned nonempty readiness reason"))
        .collect()
}
/// Resolves the explicit local profile placement intersected with optional role restrictions,
/// current reconciled device identities and effective preferences. Empty profile placement never
/// selects a default device. This is readiness only; policy still owns resource admission.
pub fn permitted_devices(
    profile: &ModelProfileConfiguration,
    role: Option<&RoleConfiguration>,
    preferences: &[DevicePreference],
    devices: &[DeviceIdentity],
) -> BTreeSet<DeviceId> {
    if profile.engine.is_none() {
        return BTreeSet::new();
    }
    profile
        .device_bindings
        .iter()
        .filter(|id| {
            !preferences
                .iter()
                .any(|preference| &preference.device_id == *id && !preference.enabled)
                && devices
                    .iter()
                    .any(|device| &device.device_id == *id && device.reconciled)
                && role.is_none_or(|role| {
                    role.device_bindings.is_empty() || role.device_bindings.contains(id)
                })
        })
        .cloned()
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn shipped_roles_never_enable_an_inferred_model_or_approval() {
        let roles = standard_team();
        assert_eq!(roles.len(), 7);
        for role in &roles {
            assert!(!role.unconfigured().enabled);
            assert!(!role.instructions.trim().is_empty());
        }
        let empty = BTreeSet::new();
        let blockers = unmet_prerequisites(
            None,
            &roles
                .iter()
                .map(StandardRole::unconfigured)
                .collect::<Vec<_>>(),
            &[],
            &[],
            &[],
            &ReadinessFacts {
                usable_profiles: &empty,
                workspace_available: true,
                sandbox_available: false,
                node_enrolled: false,
            },
        );
        assert!(
            blockers
                .iter()
                .any(|reason| reason.as_str() == "setup_required")
        );
        assert!(
            blockers
                .iter()
                .any(|reason| reason.as_str() == "sandbox_unavailable")
        );
        assert!(
            !blockers
                .iter()
                .any(|reason| reason.as_str().contains("gpu"))
        );
    }
}

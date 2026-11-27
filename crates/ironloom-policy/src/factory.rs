//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
/// Resource grant; administrator identity alone grants no project content access.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    /// Read approved resource content.
    View,
    /// Dispatch within approved scope.
    Operate,
    /// Approve a plan revision.
    Approve,
    /// Manage membership or content.
    Manage,
    /// Broaden visibility explicitly.
    Share,
    /// Use through a trusted adapter.
    UseCredential,
    /// Replace secret material.
    ReplaceCredential,
    /// Delete secret material.
    DeleteCredential,
    /// Enroll another service node.
    EnrollNode,
    /// Record administrator access to a private project.
    SelfGrant,
}
/// Explicit resource type; never a transport thread binding.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ResourceKind {
    /// Installation resource.
    Installation,
    /// Project resource.
    Project,
    /// Assignment resource.
    Assignment,
    /// Conversation resource.
    Conversation,
    /// File resource.
    File,
    /// Credential resource.
    Credential,
    /// Lesson resource.
    Lesson,
    /// Node resource.
    Node,
}
ironloom_core::contract! {
/// Validated factory record.
Resource, ResourceData {
    /// Resource type.
    kind: ResourceKind,
    /// Stable resource identity.
    id: ActorId,
    /// Owning project for inheritance; absent for installation records.
    project_id: Option<ProjectId>,
} |value| {
    let _ = value;
    if matches!(
        value.kind,
        ResourceKind::Project
            | ResourceKind::Assignment
            | ResourceKind::Conversation
            | ResourceKind::File
    ) && value.project_id.is_none()
    {
        return Err(ValidationErrors::field(
            "project_id",
            "project_scope_required",
        ));
    }
    if value.kind == ResourceKind::Project
        && value
            .project_id
            .as_ref()
            .is_some_and(|project| project.as_str() != value.id.as_str())
    {
        return Err(ValidationErrors::field(
            "project_id",
            "project_identity_mismatch",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
AuthorityCheck, AuthorityCheckData {
    /// Authenticated server-resolved human.
    operator_id: OperatorId,
    /// Delegated worker, if any.
    worker_id: Option<WorkerId>,
    /// Approved assignment delegation.
    assignment_id: Option<AssignmentId>,
    /// Actual affected resource, resolved from arguments.
    resource: Resource,
    /// Required grant.
    permission: Permission,
    /// Installation coordinated OpenFGA model revision.
    authorization_model: ActorId,
} |value| {
    let _ = value;
    if value.worker_id.is_some() != value.assignment_id.is_some() {
        return Err(ValidationErrors::field(
            "assignment_id",
            "delegation_required",
        ));
    }
    Ok(())
}
}
/// Distinct gateway outcomes; none of the failures dispatches work.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AuthorizationOutcome {
    /// Current high-consistency grants and scope permit dispatch.
    Allowed,
    /// Authority is absent.
    Denied,
    /// Authority cannot be checked; fail closed.
    Unavailable,
    /// Specific authority must first be granted.
    ApprovalRequired,
}
ironloom_core::contract! {
/// Validated factory record.
ResourceReservation, ResourceReservationData {
    /// Durable unique claim.
    reservation_id: ReservationId,
    /// One authority for all aliases/partitions of a physical pool.
    authority_id: ActorId,
    /// Current execution owner.
    node_id: NodeId,
    /// Canonical physical capacity pool.
    device_id: DeviceId,
    /// Child view consuming parent capacity.
    partition_id: Option<DeviceId>,
    /// Monotonic ownership token; expired lease alone does not free capacity.
    fence: Counter,
    /// Resident/caches/drafts/active request memory plus headroom.
    bytes: Counter,
    /// Configured concurrent request capacity.
    concurrency: Counter,
    /// Renewable ownership deadline.
    expires_at_ms: Counter,
} |value| {
    let _ = value;
    positive("fence", value.fence)?;
    positive("bytes", value.bytes)?;
    positive("concurrency", value.concurrency)?;
    positive("expires_at_ms", value.expires_at_ms)
}
}

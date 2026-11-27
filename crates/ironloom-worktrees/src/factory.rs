//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive, required};
use ironloom_core::*;
ironloom_core::contract! {
/// Validated factory record.
AssignmentWorkspace, AssignmentWorkspaceData {
    /// Stable project, independent of display name.
    project_id: ProjectId,
    /// One shared worktree per assignment.
    assignment_id: AssignmentId,
    /// Tools route to this node; metadata sharing is not file sharing.
    owner_node: NodeId,
    /// Assignment branch.
    branch: BranchName,
    /// Exact source revision.
    base_revision: ActorId,
    /// Coordinated Git owner token.
    mutation_fence: Counter,
} |value| {
    let _ = value;
    positive("mutation_fence", value.mutation_fence)
}
}
ironloom_core::contract! {
/// Validated factory record.
WorkerPaths, WorkerPathsData {
    /// Enforced assignment boundary.
    assignment_id: AssignmentId,
    /// Worker owner.
    worker_id: WorkerId,
    /// Resolved relative paths; sandbox still handles symlinks and descendants.
    write_paths: Vec<String>,
    /// Managed sibling role area, excluding instructions.
    artifact_area: String,
} |value| {
    let _ = value;
    for (field, path) in value
        .write_paths
        .iter()
        .map(|path| ("write_paths", path))
        .chain(std::iter::once(("artifact_area", &value.artifact_area)))
    {
        required(field, path)?;
        let path = std::path::Path::new(path);
        if path.is_absolute()
            || path
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err(ValidationErrors::field(
                field,
                "relative_normal_path_required",
            ));
        }
    }
    Ok(())
}
}

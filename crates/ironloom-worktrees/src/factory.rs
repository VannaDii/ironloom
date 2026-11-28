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
    /// Exact files writable through the authorized filesystem gateway, never parent directory mounts.
    write_files: Vec<String>,
    /// Directory subtrees writable by contained commands and filesystem tools.
    write_directories: Vec<String>,
    /// Managed sibling role area, excluding instructions.
    artifact_area: String,
} |value| {
    let _ = value;
    for (field, path) in value
        .write_files
        .iter()
        .map(|path| ("write_files", path))
        .chain(value.write_directories.iter().map(|path| ("write_directories", path)))
        .chain(std::iter::once(("artifact_area", &value.artifact_area)))
    {
        required(field, path)?;
        if !crate::files::ordinary_path(path) {
            return Err(ValidationErrors::field(
                field,
                "relative_normal_path_required",
            ));
        }
    }
    for (index,path) in value.write_files.iter().enumerate() {
        if value.write_files[..index].contains(path) {
            return Err(ValidationErrors::field("write_files","duplicate_path"));
        }
    }
    for (index,path) in value.write_directories.iter().enumerate() {
        if value.write_directories[..index].iter().any(|other| {
            std::path::Path::new(path).starts_with(other) || std::path::Path::new(other).starts_with(path)
        }) {
            return Err(ValidationErrors::field("write_directories","overlapping_paths"));
        }
    }
    Ok(())
}
}

//! Pure resolution of every path affected by a native filesystem tool.
use crate::factory::WorkerPaths;
use ironloom_core::validation::ValidationErrors;

/// Filesystem mutation requested through the authenticated tool gateway.
#[derive(Clone, Debug)]
pub enum FileAction {
    /// Create or atomically replace one file, without granting its parent directory.
    Write {
        /// Repository-relative target.
        path: String,
        /// Complete replacement bytes.
        contents: Vec<u8>,
    },
    /// Remove one regular file.
    Remove {
        /// Repository-relative target.
        path: String,
    },
    /// Rename a regular file, checking both affected paths.
    Move {
        /// Existing repository-relative source.
        from: String,
        /// Repository-relative destination.
        to: String,
    },
}
/// Scope-checked action. Runtime must additionally check live grants and hold path ownership
/// through the native mutation; possession of this value does not confer operator authority.
pub struct ScopedAction(FileAction);
impl ScopedAction {
    /// Returns the resolved mutation for the native adapter.
    pub fn action(&self) -> &FileAction {
        &self.0
    }
}
/// Whether a path names an ordinary relative entry outside service/Git metadata.
pub fn ordinary_path(path: &str) -> bool {
    !path.is_empty()
        && !path.contains(['\0', '\\'])
        && path
            .split('/')
            .all(|part| !matches!(part, "" | "." | ".." | ".git" | ".ironloom"))
}
impl FileAction {
    /// Every affected resource, including both ends of a move.
    pub fn paths(&self) -> Vec<&str> {
        match self {
            Self::Write { path, .. } | Self::Remove { path } => vec![path],
            Self::Move { from, to } => vec![from, to],
        }
    }
    /// Enforces approved exact-file/subtree scope without inferring permission from shell text.
    pub fn scope(self, grants: &WorkerPaths) -> Result<ScopedAction, ValidationErrors> {
        for path in self.paths() {
            if !ordinary_path(path)
                || !(grants.write_files.iter().any(|file| file == path)
                    || grants.write_directories.iter().any(|directory| {
                        path == directory
                            || path
                                .strip_prefix(directory)
                                .is_some_and(|tail| tail.starts_with('/'))
                    }))
            {
                return Err(ValidationErrors::field("paths", "outside_approved_scope"));
            }
        }
        Ok(ScopedAction(self))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::factory::{WorkerPaths, WorkerPathsData};
    use ironloom_core::{AssignmentId, WorkerId};
    #[test]
    fn exact_grants_never_authorize_siblings_or_only_one_end_of_a_move() {
        let grants = WorkerPaths::new(WorkerPathsData {
            assignment_id: AssignmentId::new("a").unwrap(),
            worker_id: WorkerId::new("w").unwrap(),
            write_files: vec!["src/one".into(), "src/two".into()],
            write_directories: vec![],
            artifact_area: "worker".into(),
        })
        .unwrap();
        assert!(
            FileAction::Move {
                from: "src/one".into(),
                to: "src/two".into()
            }
            .scope(&grants)
            .is_ok()
        );
        for path in [
            "src/other",
            "src/../two",
            "src/.git/config",
            "src//one",
            "/src/one",
        ] {
            assert!(
                FileAction::Write {
                    path: path.into(),
                    contents: vec![]
                }
                .scope(&grants)
                .is_err()
            );
            assert!(
                FileAction::Move {
                    from: "src/one".into(),
                    to: path.into()
                }
                .scope(&grants)
                .is_err()
            );
            assert!(
                FileAction::Move {
                    from: path.into(),
                    to: "src/two".into()
                }
                .scope(&grants)
                .is_err()
            );
        }
    }
}

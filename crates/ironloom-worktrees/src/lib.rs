#![forbid(unsafe_code)]

use std::path::Path;

use ironloom_core::{BranchName, IronloomError, IronloomResult};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Validated worktree allocation request.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct WorktreeRequest {
    /// Branch to allocate.
    pub branch_name: BranchName,
    /// Repository-relative safe path.
    pub relative_path: String,
}

impl WorktreeRequest {
    /// Creates a request after validating branch and path safety.
    pub fn new(branch_name: BranchName, relative_path: impl Into<String>) -> IronloomResult<Self> {
        let relative_path = relative_path.into();
        if relative_path.trim().is_empty()
            || Path::new(&relative_path).is_absolute()
            || relative_path.contains("..")
            || relative_path.contains('\\')
        {
            return Err(IronloomError::InvalidDomainValue {
                field: "worktree_path",
                reason: "unsafe repository-relative path",
            });
        }
        Ok(Self {
            branch_name,
            relative_path,
        })
    }
}

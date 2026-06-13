#![forbid(unsafe_code)]

use ironloom_core::RepositorySlug;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

/// Source-of-truth GitHub repository projection.
#[derive(Clone, Debug, Eq, JsonSchema, PartialEq, Deserialize, Serialize)]
pub struct RepositoryProjection {
    /// GitHub repository slug.
    pub repository: RepositorySlug,
    /// Default branch reported by GitHub.
    pub default_branch: String,
    /// Whether the value came directly from GitHub instead of local cache.
    pub source_of_truth: bool,
}

impl RepositoryProjection {
    /// Builds a projection that explicitly represents a fresh GitHub read.
    #[must_use]
    pub fn from_source_of_truth(
        repository: RepositorySlug,
        default_branch: impl Into<String>,
    ) -> Self {
        Self {
            repository,
            default_branch: default_branch.into(),
            source_of_truth: true,
        }
    }
}

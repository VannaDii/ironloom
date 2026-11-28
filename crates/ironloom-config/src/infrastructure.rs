//! Infrastructure-selected node identity and persistent roots. Parsing performs no filesystem I/O.
use crate::factory::{StorageRoots, StorageRootsData};
use ironloom_core::{NodeId, validation::ValidationErrors};
use std::{collections::BTreeMap, path::Path};

/// Stable enrolled service-node identity; never derived from an ephemeral pod/container ID.
pub const NODE_ID_ENV: &str = "IRONLOOM_NODE_ID";
/// Infrastructure-controlled complete projects/Git persistence root.
pub const PROJECTS_ROOT_ENV: &str = "IRONLOOM_PROJECTS_ROOT";
/// Infrastructure-controlled model persistence root, independent from project cleanup.
pub const MODELS_ROOT_ENV: &str = "IRONLOOM_MODELS_ROOT";
/// Optional designated managed PostgreSQL persistence root; unused with an external server.
pub const MANAGED_DATABASE_ROOT_ENV: &str = "IRONLOOM_MANAGED_DATABASE_ROOT";

/// Trusted node configuration; browser requests cannot select host filesystem roots.
pub struct NodeConfiguration {
    /// Stable identity whose enrollment is independently checked in PostgreSQL.
    pub node_id: NodeId,
    /// Explicit independent persistence roots; parsing never creates missing directories.
    pub roots: StorageRoots,
}
/// Parses required identity/absolute roots without inspecting hardware, creating files or resetting state.
pub fn node_configuration(
    values: &BTreeMap<String, String>,
) -> Result<NodeConfiguration, ValidationErrors> {
    let required = |name: &str| {
        values
            .get(name)
            .filter(|value| !value.trim().is_empty())
            .cloned()
            .ok_or_else(|| ValidationErrors::field(name, "required"))
    };
    let node_id = NodeId::new(required(NODE_ID_ENV)?)
        .map_err(|_| ValidationErrors::field(NODE_ID_ENV, "invalid_identity"))?;
    let roots = StorageRoots::new(StorageRootsData {
        projects: required(PROJECTS_ROOT_ENV)?,
        models: required(MODELS_ROOT_ENV)?,
        managed_database: values.get(MANAGED_DATABASE_ROOT_ENV).cloned(),
    })?;
    for (field, path) in [
        ("projects", Some(&roots.projects)),
        ("models", Some(&roots.models)),
        ("managed_database", roots.managed_database.as_ref()),
    ] {
        if path.is_some_and(|path| !Path::new(path).is_absolute()) {
            return Err(ValidationErrors::field(field, "absolute_path_required"));
        }
    }
    Ok(NodeConfiguration { node_id, roots })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_and_independent_absolute_roots_are_explicit_without_filesystem_mutation() {
        let mut values = BTreeMap::from([
            (NODE_ID_ENV.into(), "persistent-node".into()),
            (PROJECTS_ROOT_ENV.into(), "/not-created/projects".into()),
            (MODELS_ROOT_ENV.into(), "/not-created/models".into()),
        ]);
        assert_eq!(
            node_configuration(&values).unwrap().node_id.as_str(),
            "persistent-node"
        );
        values.insert(PROJECTS_ROOT_ENV.into(), "relative/private-path".into());
        let error = node_configuration(&values).err().unwrap();
        assert_eq!(
            error,
            ValidationErrors::field("projects", "absolute_path_required")
        );
        assert!(!error.to_string().contains("private-path"));
        values.insert(PROJECTS_ROOT_ENV.into(), "/not-created/models".into());
        assert!(node_configuration(&values).is_err());
        values.remove(NODE_ID_ENV);
        assert_eq!(
            node_configuration(&values).err().unwrap(),
            ValidationErrors::field(NODE_ID_ENV, "required")
        );
    }
}

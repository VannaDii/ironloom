#![forbid(unsafe_code)]

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use ironloom_artifacts::ArtifactEnvelope;
use ironloom_core::{ThreadId, WorkItemId};
use thiserror::Error;

const STATE_DIR: &str = ".ironloom";
const ARTIFACTS_DIR: &str = "artifacts";
const INDEXES_DIR: &str = "indexes";
const THREAD_INDEX_DIR: &str = "threads";
const WORK_ITEM_INDEX_DIR: &str = "work-items";
const TEMP_DIR: &str = "tmp";

/// Storage errors returned by the filesystem implementation.
#[derive(Debug, Error)]
pub enum StorageError {
    /// Filesystem operation failed.
    #[error("storage I/O failed: {0}")]
    Io(#[from] io::Error),
    /// Artifact serialization failed.
    #[error("artifact serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Result type for storage operations.
pub type StorageResult<T> = Result<T, StorageError>;

/// Filesystem-backed implementation of the first Ironloom state store.
#[derive(Debug)]
pub struct FilesystemStore {
    root: PathBuf,
}

impl FilesystemStore {
    /// Creates the `.ironloom` layout under the supplied repository root.
    pub fn new(root: impl AsRef<Path>) -> StorageResult<Self> {
        let store = Self {
            root: root.as_ref().to_path_buf(),
        };
        fs::create_dir_all(store.artifacts_dir())?;
        fs::create_dir_all(store.thread_index_dir())?;
        fs::create_dir_all(store.work_item_index_dir())?;
        fs::create_dir_all(store.temp_dir())?;
        Ok(store)
    }

    /// Writes an artifact through a temporary file and then atomically renames it.
    pub fn write_artifact(&self, artifact: &ArtifactEnvelope) -> StorageResult<()> {
        let final_path = self.artifact_path(artifact.id());
        let temporary_path = self.temp_dir().join(format!("{}.json.tmp", artifact.id()));
        let encoded = serde_json::to_vec_pretty(artifact)?;
        fs::write(&temporary_path, encoded)?;
        fs::rename(&temporary_path, final_path)?;
        self.append_index(&self.thread_index_path(artifact.thread_id()), artifact.id())?;
        self.append_index(
            &self.work_item_index_path(artifact.work_item_id()),
            artifact.id(),
        )?;
        Ok(())
    }

    /// Returns artifact identifiers indexed by Discord thread.
    pub fn artifact_ids_for_thread(&self, thread_id: &ThreadId) -> StorageResult<Vec<String>> {
        self.read_index(&self.thread_index_path(thread_id))
    }

    /// Returns artifact identifiers indexed by work item.
    pub fn artifact_ids_for_work_item(
        &self,
        work_item_id: &WorkItemId,
    ) -> StorageResult<Vec<String>> {
        self.read_index(&self.work_item_index_path(work_item_id))
    }

    /// Returns the state root path.
    #[must_use]
    pub fn state_root(&self) -> PathBuf {
        self.root.join(STATE_DIR)
    }

    fn artifact_path(&self, artifact_id: &str) -> PathBuf {
        self.artifacts_dir().join(format!("{artifact_id}.json"))
    }

    fn artifacts_dir(&self) -> PathBuf {
        self.state_root().join(ARTIFACTS_DIR)
    }

    fn thread_index_dir(&self) -> PathBuf {
        self.state_root().join(INDEXES_DIR).join(THREAD_INDEX_DIR)
    }

    fn work_item_index_dir(&self) -> PathBuf {
        self.state_root()
            .join(INDEXES_DIR)
            .join(WORK_ITEM_INDEX_DIR)
    }

    fn temp_dir(&self) -> PathBuf {
        self.state_root().join(TEMP_DIR)
    }

    fn thread_index_path(&self, thread_id: &ThreadId) -> PathBuf {
        self.thread_index_dir()
            .join(format!("{}.index", safe_file_component(thread_id.as_str())))
    }

    fn work_item_index_path(&self, work_item_id: &WorkItemId) -> PathBuf {
        self.work_item_index_dir().join(format!(
            "{}.index",
            safe_file_component(work_item_id.as_str())
        ))
    }

    fn append_index(&self, path: &Path, artifact_id: &str) -> StorageResult<()> {
        let mut values = self.read_index(path)?;
        if !values.iter().any(|value| value == artifact_id) {
            values.push(artifact_id.to_owned());
        }
        fs::write(path, values.join("\n"))?;
        Ok(())
    }

    fn read_index(&self, path: &Path) -> StorageResult<Vec<String>> {
        if !path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(path)?;
        Ok(content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(ToOwned::to_owned)
            .collect())
    }
}

fn safe_file_component(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.') {
                character
            } else {
                '_'
            }
        })
        .collect()
}

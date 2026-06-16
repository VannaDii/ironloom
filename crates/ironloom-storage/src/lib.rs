#![forbid(unsafe_code)]

use std::fs;
use std::fs::OpenOptions;
use std::io;
use std::io::Write;
use std::path::{Path, PathBuf};

use aes_gcm::aead::{Aead, KeyInit, OsRng, rand_core::RngCore};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use ironloom_artifacts::ArtifactEnvelope;
use ironloom_config::StoredSetupConfig;
use ironloom_core::{ThreadId, WorkItemId};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const STATE_DIR: &str = ".ironloom";
const ARTIFACTS_DIR: &str = "artifacts";
const INDEXES_DIR: &str = "indexes";
const THREAD_INDEX_DIR: &str = "threads";
const THREAD_BINDINGS_INDEX_DIR: &str = "thread-bindings";
const WORK_ITEM_INDEX_DIR: &str = "work-items";
const TEMP_DIR: &str = "tmp";
const SETUP_DIR: &str = "setup";
const SETUP_CONFIG_FILE: &str = "config.enc.json";
const SETUP_CONFIG_TEMP_FILE: &str = "config.enc.json.tmp";
const ENCRYPTED_SETUP_CONFIG_VERSION: u16 = 1;
const CONFIG_KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;

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

/// Thread binding lookup errors.
#[derive(Debug, Error)]
pub enum ThreadBindingError {
    /// Thread has no persisted binding.
    #[error("missing thread binding for {thread_id}")]
    Missing {
        /// Discord thread identifier.
        thread_id: String,
    },
    /// Thread has more than one persisted work item binding.
    #[error("ambiguous thread binding for {thread_id}")]
    Ambiguous {
        /// Discord thread identifier.
        thread_id: String,
    },
    /// Persisted binding contained an invalid work item identifier.
    #[error("invalid thread binding for {thread_id}: {reason}")]
    Invalid {
        /// Discord thread identifier.
        thread_id: String,
        /// Validation failure reason.
        reason: String,
    },
    /// Filesystem-backed binding lookup failed.
    #[error(transparent)]
    Storage(#[from] StorageError),
}

/// Errors returned by encrypted setup configuration storage.
#[derive(Debug, Error)]
pub enum SetupConfigStoreError {
    /// Filesystem operation failed.
    #[error("setup config I/O failed: {0}")]
    Io(#[from] io::Error),
    /// Setup config serialization failed.
    #[error("setup config serialization failed: {0}")]
    Serialization(#[from] serde_json::Error),
    /// Config key was not valid base64-encoded 256-bit key material.
    #[error("IRONLOOM_CONFIG_KEY must be base64-encoded 32-byte key material")]
    InvalidConfigKey,
    /// Encrypted setup file could not be decrypted with the provided key.
    #[error("encrypted setup config could not be decrypted")]
    DecryptionFailed,
}

/// Filesystem-backed encrypted setup configuration store.
#[derive(Debug)]
pub struct SetupConfigStore {
    state_root: PathBuf,
}

impl SetupConfigStore {
    /// Creates a setup config store rooted at the runtime state root.
    #[must_use]
    pub fn new(state_root: impl AsRef<Path>) -> Self {
        Self {
            state_root: state_root.as_ref().to_path_buf(),
        }
    }

    /// Returns the encrypted setup config path.
    #[must_use]
    pub fn config_path(&self) -> PathBuf {
        self.setup_dir().join(SETUP_CONFIG_FILE)
    }

    /// Reads and decrypts the local setup config when it exists.
    pub fn read(
        &self,
        config_key: &str,
    ) -> Result<Option<StoredSetupConfig>, SetupConfigStoreError> {
        let key = decode_config_key(config_key)?;
        let path = self.config_path();
        if !path.exists() {
            return Ok(None);
        }
        let encoded = fs::read_to_string(path)?;
        let payload: EncryptedSetupConfig = serde_json::from_str(&encoded)?;
        let nonce = STANDARD
            .decode(payload.nonce)
            .map_err(|_| SetupConfigStoreError::DecryptionFailed)?;
        if nonce.len() != NONCE_BYTES {
            return Err(SetupConfigStoreError::DecryptionFailed);
        }
        let ciphertext = STANDARD
            .decode(payload.ciphertext)
            .map_err(|_| SetupConfigStoreError::DecryptionFailed)?;
        let cipher =
            Aes256Gcm::new_from_slice(&key).map_err(|_| SetupConfigStoreError::InvalidConfigKey)?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
            .map_err(|_| SetupConfigStoreError::DecryptionFailed)?;
        let config = serde_json::from_slice(&plaintext)?;
        Ok(Some(config))
    }

    /// Encrypts and persists the local setup config.
    pub fn write(
        &self,
        config_key: &str,
        config: &StoredSetupConfig,
    ) -> Result<(), SetupConfigStoreError> {
        let key = decode_config_key(config_key)?;
        fs::create_dir_all(self.setup_dir())?;
        let plaintext = serde_json::to_vec(config)?;
        let cipher =
            Aes256Gcm::new_from_slice(&key).map_err(|_| SetupConfigStoreError::InvalidConfigKey)?;
        let mut nonce = [0_u8; NONCE_BYTES];
        OsRng.fill_bytes(&mut nonce);
        let ciphertext = cipher
            .encrypt(Nonce::from_slice(&nonce), plaintext.as_ref())
            .map_err(|_| SetupConfigStoreError::DecryptionFailed)?;
        let payload = EncryptedSetupConfig {
            version: ENCRYPTED_SETUP_CONFIG_VERSION,
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(ciphertext),
        };
        let temporary_path = self.setup_dir().join(SETUP_CONFIG_TEMP_FILE);
        write_owner_only_file(&temporary_path, &serde_json::to_vec_pretty(&payload)?)?;
        fs::rename(temporary_path, self.config_path())?;
        Ok(())
    }

    fn setup_dir(&self) -> PathBuf {
        self.state_root.join(SETUP_DIR)
    }
}

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
        fs::create_dir_all(store.thread_bindings_index_dir())?;
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

    /// Persists a Discord thread to work item binding.
    pub fn bind_thread_to_work_item(
        &self,
        thread_id: &ThreadId,
        work_item_id: &WorkItemId,
    ) -> Result<(), ThreadBindingError> {
        let path = self.thread_binding_path(thread_id);
        let mut values = self.read_index(&path)?;
        if !values.iter().any(|value| value == work_item_id.as_str()) {
            values.push(work_item_id.as_str().to_owned());
        }
        fs::write(path, values.join("\n")).map_err(StorageError::from)?;
        Ok(())
    }

    /// Resolves exactly one work item binding for a Discord thread.
    pub fn resolve_thread_binding(
        &self,
        thread_id: &ThreadId,
    ) -> Result<WorkItemId, ThreadBindingError> {
        let values = self.read_index(&self.thread_binding_path(thread_id))?;
        match values.as_slice() {
            [] => Err(ThreadBindingError::Missing {
                thread_id: thread_id.as_str().to_owned(),
            }),
            [work_item_id] => {
                WorkItemId::new(work_item_id).map_err(|error| ThreadBindingError::Invalid {
                    thread_id: thread_id.as_str().to_owned(),
                    reason: error.to_string(),
                })
            }
            _ => Err(ThreadBindingError::Ambiguous {
                thread_id: thread_id.as_str().to_owned(),
            }),
        }
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

    fn thread_bindings_index_dir(&self) -> PathBuf {
        self.state_root()
            .join(INDEXES_DIR)
            .join(THREAD_BINDINGS_INDEX_DIR)
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

    fn thread_binding_path(&self, thread_id: &ThreadId) -> PathBuf {
        self.thread_bindings_index_dir().join(format!(
            "{}.binding",
            safe_file_component(thread_id.as_str())
        ))
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

#[derive(Debug, Deserialize, Serialize)]
struct EncryptedSetupConfig {
    version: u16,
    nonce: String,
    ciphertext: String,
}

fn decode_config_key(config_key: &str) -> Result<[u8; CONFIG_KEY_BYTES], SetupConfigStoreError> {
    let decoded = STANDARD
        .decode(config_key)
        .map_err(|_| SetupConfigStoreError::InvalidConfigKey)?;
    decoded
        .try_into()
        .map_err(|_| SetupConfigStoreError::InvalidConfigKey)
}

#[cfg(unix)]
fn write_owner_only_file(path: &Path, content: &[u8]) -> io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(content)?;
    file.sync_all()
}

#[cfg(not(unix))]
fn write_owner_only_file(path: &Path, content: &[u8]) -> io::Result<()> {
    fs::write(path, content)
}

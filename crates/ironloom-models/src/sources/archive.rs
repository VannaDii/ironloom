//! Bounded current tar/gzip installation. Archives never run code or load a model.
use super::downloads::DownloadLimits;
use crate::providers::AdapterError;
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fs::File,
    io::{BufReader, Read},
    path::{Component, Path, PathBuf},
};
use tokio::sync::watch;
const MAX_ENTRIES: usize = 16384;
const MAX_METADATA_BYTES: u64 = 16 * 1024 * 1024;
const MAX_EXTENSION_BYTES: u64 = 1024 * 1024;
const COPY_BYTES: usize = 128 * 1024;
/// Private staged file; hashes are computed, never falsely attributed to the publisher.
pub(super) struct StagedFile {
    /// Validated archive-relative path with no link/traversal authority.
    pub path: PathBuf,
    /// Exact decompressed file length.
    pub bytes: u64,
    /// Computed digest; not a publisher-provided digest.
    pub sha256: String,
}
/// Owns only disposable extraction scratch until the downloader publishes checked paths.
pub(super) struct StagedArchive {
    /// Private disposable scratch, dropped before releasing its source writer lease.
    pub directory: tempfile::TempDir,
    /// Complete checked files; empty archives never become installed models.
    pub files: Vec<StagedFile>,
    _lease: File,
}
struct Checked<R> {
    reader: R,
    left: u64,
    cancel: watch::Receiver<bool>,
}
impl<R: Read> Read for Checked<R> {
    fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
        if *self.cancel.borrow() || self.cancel.has_changed().is_err() {
            return Err(std::io::Error::other("transfer cancelled"));
        }
        let maximum = buffer
            .len()
            .min(self.left.saturating_add(1).min(usize::MAX as u64) as usize);
        let read = self.reader.read(&mut buffer[..maximum])?;
        self.left = self
            .left
            .checked_sub(read as u64)
            .ok_or_else(|| std::io::Error::other("archive ceiling"))?;
        Ok(read)
    }
}
fn reader(
    path: &Path,
    limit: u64,
    cancel: watch::Receiver<bool>,
) -> Result<Checked<flate2::read::MultiGzDecoder<BufReader<File>>>, AdapterError> {
    Ok(Checked {
        reader: flate2::read::MultiGzDecoder::new(BufReader::new(
            File::open(path).map_err(|_| AdapterError::Unavailable)?,
        )),
        left: limit,
        cancel,
    })
}
fn normalized(path: &Path) -> Result<PathBuf, AdapterError> {
    let mut result = PathBuf::new();
    for part in path.components() {
        match part {
            Component::CurDir => {}
            Component::Normal(name) if name != ".git" && name != ".ironloom" => result.push(name),
            _ => return Err(AdapterError::Unsupported),
        }
    }
    Ok(result)
}
fn finish<R: Read>(reader: &mut R) -> Result<(), AdapterError> {
    let mut buffer = [0u8; COPY_BYTES];
    let mut trailing = 0u64;
    loop {
        let read = reader
            .read(&mut buffer)
            .map_err(|_| AdapterError::Unsupported)?;
        if read == 0 {
            return Ok(());
        }
        trailing = trailing
            .checked_add(read as u64)
            .ok_or(AdapterError::Unsupported)?;
        if trailing > MAX_METADATA_BYTES || buffer[..read].iter().any(|byte| *byte != 0) {
            return Err(AdapterError::Unsupported);
        }
    }
}
fn preflight(
    path: &Path,
    limits: DownloadLimits,
    compressed: u64,
    cancel: watch::Receiver<bool>,
) -> Result<u64, AdapterError> {
    let remaining = limits
        .transfer_bytes
        .checked_sub(compressed)
        .ok_or(AdapterError::Unsupported)?;
    let ceiling = remaining
        .checked_add(MAX_METADATA_BYTES)
        .ok_or(AdapterError::Unsupported)?;
    let mut archive = tar::Archive::new(reader(path, ceiling, cancel)?);
    let mut total = 0u64;
    let mut metadata = 0u64;
    let mut override_size = None;
    // Validate raw metadata BEFORE tar's normal preprocessing can allocate long-name/PAX bodies.
    // Requiring any PAX size to match its raw header keeps both passes at identical offsets.
    for (index, entry) in archive
        .entries()
        .map_err(|_| AdapterError::Unsupported)?
        .raw(true)
        .enumerate()
    {
        if index >= MAX_ENTRIES {
            return Err(AdapterError::Unsupported);
        }
        let mut entry = entry.map_err(|_| AdapterError::Unsupported)?;
        let size = entry.size();
        let kind = entry.header().entry_type();
        if kind.is_pax_local_extensions()
            || kind.is_pax_global_extensions()
            || kind.is_gnu_longname()
        {
            if size > MAX_EXTENSION_BYTES {
                return Err(AdapterError::Unsupported);
            }
            metadata = metadata
                .checked_add(size)
                .filter(|total| *total <= MAX_METADATA_BYTES)
                .ok_or(AdapterError::Unsupported)?;
            if (kind.is_pax_local_extensions() || kind.is_pax_global_extensions())
                && let Some(fields) = entry
                    .pax_extensions()
                    .map_err(|_| AdapterError::Unsupported)?
            {
                for field in fields {
                    let field = field.map_err(|_| AdapterError::Unsupported)?;
                    let key = field.key().map_err(|_| AdapterError::Unsupported)?;
                    if key.starts_with("GNU.sparse")
                        || (kind.is_pax_global_extensions()
                            && matches!(key, "path" | "size" | "linkpath"))
                    {
                        return Err(AdapterError::Unsupported);
                    }
                    if key == "size" {
                        override_size = Some(
                            field
                                .value()
                                .map_err(|_| AdapterError::Unsupported)?
                                .parse::<u64>()
                                .map_err(|_| AdapterError::Unsupported)?,
                        );
                    }
                }
            }
        } else {
            if !kind.is_file() && !kind.is_dir() {
                return Err(AdapterError::Unsupported);
            }
            if override_size
                .take()
                .is_some_and(|expected| expected != size)
            {
                return Err(AdapterError::Unsupported);
            }
            if size > limits.per_file_bytes {
                return Err(AdapterError::Unsupported);
            }
            total = total
                .checked_add(size)
                .filter(|total| *total <= remaining)
                .ok_or(AdapterError::Unsupported)?;
        }
    }
    finish(&mut archive.into_inner())?;
    Ok(ceiling)
}
/// Extracts to private scratch. No final inventory/file becomes visible until the caller checks it.
pub(super) async fn extract(
    path: PathBuf,
    destination: PathBuf,
    limits: DownloadLimits,
    compressed: u64,
    cancel: watch::Receiver<bool>,
    lease: File,
) -> Result<StagedArchive, AdapterError> {
    tokio::task::spawn_blocking(move || {
        if *cancel.borrow() || cancel.has_changed().is_err() {
            return Err(AdapterError::Interrupted);
        }
        let ceiling = preflight(&path, limits, compressed, cancel.clone())?;
        let directory = tempfile::Builder::new()
            .prefix(".extract-")
            .tempdir_in(destination)
            .map_err(|_| AdapterError::Unavailable)?;
        let mut archive = tar::Archive::new(reader(&path, ceiling, cancel.clone())?);
        let mut files = Vec::new();
        let mut names = BTreeSet::new();
        for entry in archive.entries().map_err(|_| AdapterError::Unsupported)? {
            if *cancel.borrow() || cancel.has_changed().is_err() {
                return Err(AdapterError::Interrupted);
            }
            let mut entry = entry.map_err(|_| AdapterError::Unsupported)?;
            let kind = entry.header().entry_type();
            if kind.is_pax_global_extensions() {
                continue;
            }
            let relative = normalized(&entry.path().map_err(|_| AdapterError::Unsupported)?)?;
            if relative.as_os_str().is_empty() {
                if kind.is_dir() {
                    continue;
                }
                return Err(AdapterError::Unsupported);
            }
            if !names.insert(relative.clone()) {
                return Err(AdapterError::Unsupported);
            }
            let target = directory.path().join(&relative);
            if kind.is_dir() {
                std::fs::create_dir_all(target).map_err(|_| AdapterError::Unsupported)?;
                continue;
            }
            if !kind.is_file() || entry.size() > limits.per_file_bytes {
                return Err(AdapterError::Unsupported);
            }
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|_| AdapterError::Unsupported)?;
            }
            let mut output = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&target)
                .map_err(|_| AdapterError::Unsupported)?;
            let mut digest = Sha256::new();
            let mut written = 0u64;
            let mut buffer = [0u8; COPY_BYTES];
            loop {
                if *cancel.borrow() || cancel.has_changed().is_err() {
                    return Err(AdapterError::Interrupted);
                }
                let read = entry
                    .read(&mut buffer)
                    .map_err(|_| AdapterError::Unsupported)?;
                if read == 0 {
                    break;
                }
                written = written
                    .checked_add(read as u64)
                    .filter(|bytes| *bytes <= limits.per_file_bytes)
                    .ok_or(AdapterError::Unsupported)?;
                std::io::Write::write_all(&mut output, &buffer[..read])
                    .map_err(|_| AdapterError::Unavailable)?;
                digest.update(&buffer[..read]);
            }
            if written != entry.size() {
                return Err(AdapterError::Unsupported);
            }
            output.sync_all().map_err(|_| AdapterError::Unavailable)?;
            files.push(StagedFile {
                path: relative,
                bytes: written,
                sha256: hex::encode(digest.finalize()),
            });
        }
        finish(&mut archive.into_inner())?;
        if files.is_empty() {
            return Err(AdapterError::Unsupported);
        }
        Ok(StagedArchive {
            directory,
            files,
            _lease: lease,
        })
    })
    .await
    .map_err(|_| AdapterError::Unavailable)?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    fn compressed(root: &Path, tar: &[u8]) -> PathBuf {
        let path = root.join("bundle.gz");
        let mut gzip = flate2::write::GzEncoder::new(
            File::create(&path).unwrap(),
            flate2::Compression::fast(),
        );
        gzip.write_all(tar).unwrap();
        gzip.finish().unwrap();
        path
    }
    #[test]
    fn oversized_extension_is_rejected_from_its_header_before_body_allocation() {
        let root = tempfile::tempdir().unwrap();
        let mut header = tar::Header::new_gnu();
        header.set_path("PaxHeaders/fixture").unwrap();
        header.set_entry_type(tar::EntryType::XHeader);
        header.set_size(MAX_EXTENSION_BYTES + 1);
        header.set_cksum();
        let path = compressed(root.path(), header.as_bytes());
        let (_sender, cancel) = watch::channel(false);
        let compressed = std::fs::metadata(&path).unwrap().len();
        assert!(matches!(
            preflight(
                &path,
                DownloadLimits {
                    per_file_bytes: u64::MAX / 2,
                    transfer_bytes: u64::MAX / 2
                },
                compressed,
                cancel
            ),
            Err(AdapterError::Unsupported)
        ));
    }
    #[tokio::test]
    async fn cancelled_or_lost_owner_releases_extraction_lease_without_publishing_scratch() {
        let root = tempfile::tempdir().unwrap();
        for lost in [false, true] {
            let path = compressed(root.path(), &[0; 1024]);
            let lock_path = root.path().join("writer.lock");
            let lease = File::create(&lock_path).unwrap();
            lease.lock().unwrap();
            let (sender, cancel) = watch::channel(!lost);
            if lost {
                drop(sender);
            }
            assert!(matches!(
                extract(
                    path,
                    root.path().into(),
                    DownloadLimits {
                        per_file_bytes: 4096,
                        transfer_bytes: 8192
                    },
                    32,
                    cancel,
                    lease
                )
                .await,
                Err(AdapterError::Interrupted)
            ));
            let lease = File::open(lock_path).unwrap();
            lease.try_lock().unwrap();
            assert!(std::fs::read_dir(root.path()).unwrap().all(|entry| {
                !entry
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .starts_with(".extract-")
            }));
        }
    }
}

//! Native filesystem mutations; pure scope decisions belong to ironloom-worktrees.
//! Runtime holds durable affected-path ownership and current authority before calling this adapter.
use crate::sandbox::SandboxError;
use ironloom_worktrees::files::{FileAction, ScopedAction};
use nix::{
    fcntl::{OFlag, open, openat, renameat},
    sys::stat::{Mode, SFlag, fchmod, fstat},
    unistd::{UnlinkatFlags, unlinkat},
};
use std::{fs::File, io::Write, os::fd::OwnedFd, path::Path};

/// Pinned workspace root; no symlink component is followed during any operation.
pub struct Files {
    root: OwnedFd,
}
impl Files {
    /// Opens the infrastructure-selected existing absolute workspace directory.
    pub fn open(root: &Path) -> Result<Self, SandboxError> {
        if !root.is_absolute() {
            return Err(SandboxError);
        }
        Ok(Self {
            root: open(
                root,
                OFlag::O_PATH | OFlag::O_DIRECTORY | OFlag::O_NOFOLLOW | OFlag::O_CLOEXEC,
                Mode::empty(),
            )
            .map_err(|_| SandboxError)?,
        })
    }
    fn parent(&self, path: &str) -> Result<(OwnedFd, String), SandboxError> {
        let mut parts = path.split('/').collect::<Vec<_>>();
        let name = parts.pop().ok_or(SandboxError)?.to_owned();
        let mut parent = nix::unistd::dup(&self.root).map_err(|_| SandboxError)?;
        for part in parts {
            parent = openat(
                &parent,
                part,
                OFlag::O_PATH | OFlag::O_DIRECTORY | OFlag::O_NOFOLLOW | OFlag::O_CLOEXEC,
                Mode::empty(),
            )
            .map_err(|_| SandboxError)?;
        }
        Ok((parent, name))
    }
    fn regular(parent: &OwnedFd, name: &str, missing: bool) -> Result<(), SandboxError> {
        match openat(
            parent,
            name,
            OFlag::O_PATH | OFlag::O_NOFOLLOW | OFlag::O_CLOEXEC,
            Mode::empty(),
        ) {
            Ok(fd)
                if SFlag::from_bits_truncate(fstat(&fd).map_err(|_| SandboxError)?.st_mode)
                    == SFlag::S_IFREG =>
            {
                Ok(())
            }
            Err(nix::errno::Errno::ENOENT) if missing => Ok(()),
            _ => Err(SandboxError),
        }
    }
    /// Applies one scope-checked action. Exact-file grants never expose a writable parent mount.
    /// Atomic replacement detaches an existing hard-link alias rather than modifying its inode.
    pub fn apply(&self, action: &ScopedAction) -> Result<(), SandboxError> {
        match action.action() {
            FileAction::Write { path, contents } => {
                let (parent, name) = self.parent(path)?;
                Self::regular(&parent, &name, true)?;
                let permissions = openat(
                    &parent,
                    name.as_str(),
                    OFlag::O_PATH | OFlag::O_NOFOLLOW | OFlag::O_CLOEXEC,
                    Mode::empty(),
                )
                .ok()
                .map(|fd| fstat(&fd))
                .transpose()
                .map_err(|_| SandboxError)?
                .map(|stat| {
                    Mode::from_bits_truncate(stat.st_mode)
                        & (Mode::S_IRWXU | Mode::S_IRWXG | Mode::S_IRWXO)
                });
                // O_EXCL prevents following an existing temporary name; failed writes are removed.
                let temporary = format!(".ironloom-write-{}", uuid::Uuid::new_v4());
                let fd = openat(
                    &parent,
                    temporary.as_str(),
                    OFlag::O_WRONLY
                        | OFlag::O_CREAT
                        | OFlag::O_EXCL
                        | OFlag::O_NOFOLLOW
                        | OFlag::O_CLOEXEC,
                    Mode::S_IRUSR | Mode::S_IWUSR,
                )
                .map_err(|_| SandboxError)?;
                let mut file = File::from(fd);
                let result = (|| {
                    file.write_all(contents).map_err(|_| SandboxError)?;
                    if let Some(permissions) = permissions {
                        fchmod(&file, permissions).map_err(|_| SandboxError)?;
                    }
                    file.sync_all().map_err(|_| SandboxError)?;
                    renameat(&parent, temporary.as_str(), &parent, name.as_str())
                        .map_err(|_| SandboxError)
                })();
                if result.is_err() {
                    let _ = unlinkat(&parent, temporary.as_str(), UnlinkatFlags::NoRemoveDir);
                }
                result
            }
            FileAction::Remove { path } => {
                let (parent, name) = self.parent(path)?;
                Self::regular(&parent, &name, false)?;
                unlinkat(&parent, name.as_str(), UnlinkatFlags::NoRemoveDir)
                    .map_err(|_| SandboxError)
            }
            FileAction::Move { from, to } => {
                let (source, from) = self.parent(from)?;
                let (destination, to) = self.parent(to)?;
                Self::regular(&source, &from, false)?;
                Self::regular(&destination, &to, true)?;
                renameat(&source, from.as_str(), &destination, to.as_str())
                    .map_err(|_| SandboxError)
            }
        }
    }
}

//! Linux bubblewrap/seccomp execution adapter. Trusted runtime resolves authority before launch.
//! A single-threaded helper opens mount descriptors; unrelated concurrent workers never inherit
//! temporarily exposed host descriptors from the multithreaded service.
use ironloom_worktrees::factory::WorkerPaths;
use nix::{
    fcntl::{FcntlArg, FdFlag, OFlag, fcntl, open, openat},
    sys::stat::{Mode, SFlag, fstat},
};
use serde::{Deserialize, Serialize};
use std::{
    fs::File,
    io::{Read, Write},
    os::{
        fd::{AsRawFd, OwnedFd},
        unix::process::CommandExt,
    },
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
};
use tokio::io::AsyncWriteExt;

const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const WORKSPACE: &str = "/workspace";
const ARTIFACTS: &str = "/artifacts";
const SYSTEM_ROOTS: [&str; 4] = ["/usr", "/bin", "/lib", "/lib64"];
/// Redacted containment failure, without command text, output or host paths.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
#[error("required command containment unavailable or invalid")]
pub struct SandboxError;

/// Trusted assignment launch resolved from approved scope. Every boundary validates it again.
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Launch {
    worktree: PathBuf,
    artifact_root: PathBuf,
    paths: WorkerPaths,
    command: Vec<String>,
}
impl Launch {
    /// Requires explicit absolute roots and an immutable validated path grant; no root is created.
    pub fn new(
        worktree: PathBuf,
        artifact_root: PathBuf,
        paths: WorkerPaths,
        command: Vec<String>,
    ) -> Result<Self, SandboxError> {
        let value = Self {
            worktree,
            artifact_root,
            paths,
            command,
        };
        value.validate()?;
        Ok(value)
    }
    fn validate(&self) -> Result<(), SandboxError> {
        if !self.worktree.is_absolute()
            || !self.artifact_root.is_absolute()
            || self.command.is_empty()
            || self.command[0].trim().is_empty()
            || self.command.iter().any(|arg| arg.contains('\0'))
            || self
                .command
                .iter()
                .try_fold(0usize, |sum, arg| sum.checked_add(arg.len()))
                .is_none_or(|size| size > MAX_REQUEST_BYTES)
        {
            return Err(SandboxError);
        }
        for path in self
            .paths
            .write_directories
            .iter()
            .chain(self.paths.write_files.iter())
            .chain(std::iter::once(&self.paths.artifact_area))
        {
            if Path::new(path).components().any(
                |part| !matches!(part,Component::Normal(name) if name!=".git" && name!=".ironloom"),
            ) {
                return Err(SandboxError);
            }
        }
        let paths = &self.paths.write_directories;
        for (index, path) in paths.iter().enumerate() {
            if paths.iter().skip(index + 1).any(|other| {
                Path::new(path).starts_with(other) || Path::new(other).starts_with(path)
            }) {
                return Err(SandboxError);
            }
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    parent_pid: u32,
    bwrap: PathBuf,
    launch: Launch,
}
/// Infrastructure-selected helper and bubblewrap binaries; construction executes nothing.
pub struct Runner {
    helper: PathBuf,
    bwrap: PathBuf,
}
impl Runner {
    /// Uses only absolute trusted executable paths; no PATH search or unsandboxed fallback exists.
    pub fn new(helper: PathBuf, bwrap: PathBuf) -> Result<Self, SandboxError> {
        if !helper.is_absolute() || !bwrap.is_absolute() {
            return Err(SandboxError);
        }
        Ok(Self { helper, bwrap })
    }
    /// Starts the containment helper with bounded configuration. The caller owns durable process
    /// identity, output draining, cancellation and reconciliation; spawn alone does not prove startup.
    pub async fn spawn(&self, launch: Launch) -> Result<tokio::process::Child, SandboxError> {
        launch.validate()?;
        let bytes = serde_json::to_vec(&Request {
            parent_pid: std::process::id(),
            bwrap: self.bwrap.clone(),
            launch,
        })
        .map_err(|_| SandboxError)?;
        if bytes.len() > MAX_REQUEST_BYTES {
            return Err(SandboxError);
        }
        let mut child = tokio::process::Command::new(&self.helper)
            .arg("sandbox-child")
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| SandboxError)?;
        let mut input = child.stdin.take().ok_or(SandboxError)?;
        input.write_all(&bytes).await.map_err(|_| SandboxError)?;
        input.shutdown().await.map_err(|_| SandboxError)?;
        drop(input);
        Ok(child)
    }
}
fn root(path: &Path) -> Result<OwnedFd, SandboxError> {
    open(
        path,
        OFlag::O_PATH | OFlag::O_DIRECTORY | OFlag::O_NOFOLLOW | OFlag::O_CLOEXEC,
        Mode::empty(),
    )
    .map_err(|_| SandboxError)
}
fn beneath(base: &OwnedFd, path: &str) -> Result<OwnedFd, SandboxError> {
    let mut current = nix::unistd::dup(base).map_err(|_| SandboxError)?;
    let parts = Path::new(path).components().collect::<Vec<_>>();
    if parts.is_empty() {
        return Err(SandboxError);
    }
    for (index, part) in parts.iter().enumerate() {
        let Component::Normal(name) = part else {
            return Err(SandboxError);
        };
        let flags = OFlag::O_PATH
            | OFlag::O_NOFOLLOW
            | OFlag::O_CLOEXEC
            | if index + 1 < parts.len() {
                OFlag::O_DIRECTORY
            } else {
                OFlag::empty()
            };
        current =
            openat(&current, Path::new(name), flags, Mode::empty()).map_err(|_| SandboxError)?;
        let kind = SFlag::from_bits_truncate(fstat(&current).map_err(|_| SandboxError)?.st_mode);
        if !matches!(kind, SFlag::S_IFREG | SFlag::S_IFDIR) {
            return Err(SandboxError);
        }
    }
    Ok(current)
}
// Scan through pinned directory descriptors without following names to another directory.
// Every writable inode must be private: a read-only mount elsewhere does not revoke writes
// through another hard link. The gateway must hold its path ownership through process stop.
fn private_inodes(fd: &OwnedFd) -> Result<(), SandboxError> {
    const MAX_ENTRIES: usize = 1_000_000;
    const MAX_DEPTH: usize = 256;
    fn visit(fd: &OwnedFd, depth: usize, remaining: &mut usize) -> Result<(), SandboxError> {
        let stat = fstat(fd).map_err(|_| SandboxError)?;
        let kind = SFlag::from_bits_truncate(stat.st_mode);
        if kind != SFlag::S_IFDIR {
            return if matches!(kind, SFlag::S_IFREG | SFlag::S_IFLNK) && stat.st_nlink == 1 {
                Ok(())
            } else {
                Err(SandboxError)
            };
        }
        if depth >= MAX_DEPTH {
            return Err(SandboxError);
        }
        for entry in std::fs::read_dir(format!("/proc/self/fd/{}", fd.as_raw_fd()))
            .map_err(|_| SandboxError)?
        {
            *remaining = remaining.checked_sub(1).ok_or(SandboxError)?;
            let name = entry.map_err(|_| SandboxError)?.file_name();
            let child = openat(
                fd,
                Path::new(&name),
                OFlag::O_PATH | OFlag::O_NOFOLLOW | OFlag::O_CLOEXEC,
                Mode::empty(),
            )
            .map_err(|_| SandboxError)?;
            visit(&child, depth + 1, remaining)?;
        }
        Ok(())
    }
    let mut remaining = MAX_ENTRIES;
    visit(fd, 0, &mut remaining)
}
/// Runs only in the dedicated single-threaded child before any Tokio runtime starts.
/// Mounts immutable descriptor targets, installs seccomp and replaces itself with bubblewrap.
pub fn child_main() -> Result<(), SandboxError> {
    // Install containment before reading a possibly slow parent pipe. The expected-parent check
    // rejects orphan helpers if the service died before this handler could install PDEATHSIG.
    nix::sys::prctl::set_pdeathsig(nix::sys::signal::Signal::SIGKILL).map_err(|_| SandboxError)?;
    nix::sys::prctl::set_no_new_privs().map_err(|_| SandboxError)?;
    let mut bytes = Vec::new();
    std::io::stdin()
        .take((MAX_REQUEST_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| SandboxError)?;
    if bytes.len() > MAX_REQUEST_BYTES {
        return Err(SandboxError);
    }
    let request: Request = serde_json::from_slice(&bytes).map_err(|_| SandboxError)?;
    if nix::unistd::getppid().as_raw() as u32 != request.parent_pid {
        return Err(SandboxError);
    }
    request.launch.validate()?;
    if !request.bwrap.is_absolute() {
        return Err(SandboxError);
    }
    let workspace = root(&request.launch.worktree)?;
    let artifact_root = root(&request.launch.artifact_root)?;
    let artifact = beneath(&artifact_root, &request.launch.paths.artifact_area)?;
    if SFlag::from_bits_truncate(fstat(&artifact).map_err(|_| SandboxError)?.st_mode)
        != SFlag::S_IFDIR
    {
        return Err(SandboxError);
    }
    private_inodes(&artifact)?;
    let mut command = Command::new(request.bwrap);
    command.env_clear().args([
        "--unshare-user",
        "--unshare-pid",
        "--unshare-net",
        "--unshare-ipc",
        "--unshare-uts",
        "--new-session",
        "--die-with-parent",
        "--cap-drop",
        "ALL",
        "--clearenv",
    ]);
    for path in SYSTEM_ROOTS {
        if Path::new(path).exists() {
            command.args(["--ro-bind", path, path]);
        }
    }
    command.args([
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
        "--setenv",
        "PATH",
        "/usr/bin:/bin",
        "--setenv",
        "HOME",
        "/tmp",
        "--setenv",
        "LANG",
        "C.UTF-8",
        "--chdir",
        WORKSPACE,
    ]);
    let mut mounts = vec![workspace, artifact];
    command.args([
        "--ro-bind-fd",
        &mounts[0].as_raw_fd().to_string(),
        WORKSPACE,
    ]);
    command.args(["--bind-fd", &mounts[1].as_raw_fd().to_string(), ARTIFACTS]);
    for path in &request.launch.paths.write_directories {
        let fd = beneath(&mounts[0], path)?;
        if SFlag::from_bits_truncate(fstat(&fd).map_err(|_| SandboxError)?.st_mode)
            != SFlag::S_IFDIR
        {
            return Err(SandboxError);
        }
        private_inodes(&fd)?;
        command
            .arg("--bind-fd")
            .arg(fd.as_raw_fd().to_string())
            .arg(Path::new(WORKSPACE).join(path));
        mounts.push(fd);
    }
    // Descriptors become inheritable only in this single-threaded child, then bubblewrap closes
    // its setup descriptors before command execution. The service never clears CLOEXEC globally.
    for fd in &mounts {
        fcntl(fd, FcntlArg::F_SETFD(FdFlag::empty())).map_err(|_| SandboxError)?;
    }
    let (read, write) = nix::unistd::pipe2(OFlag::O_CLOEXEC).map_err(|_| SandboxError)?;
    File::from(write)
        .write_all(&filter()?)
        .map_err(|_| SandboxError)?;
    command
        .stdin(Stdio::from(read))
        .args(["--seccomp", "0", "--"])
        .args(&request.launch.command);
    let _error = command.exec();
    Err(SandboxError)
}
fn filter() -> Result<Vec<u8>, SandboxError> {
    use nix::libc;
    const LD_ABS: u16 = 0x20;
    const JEQ: u16 = 0x15;
    const JSET: u16 = 0x45;
    const RET: u16 = 0x06;
    const KILL: u32 = 0x80000000;
    const ALLOW: u32 = 0x7fff0000;
    const ERROR: u32 = 0x00050000;
    #[cfg(target_arch = "x86_64")]
    const ARCH: u32 = 0xc000003e;
    #[cfg(target_arch = "aarch64")]
    const ARCH: u32 = 0xc00000b7;
    #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
    return Err(SandboxError);
    #[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
    {
        let mut instructions = vec![
            (LD_ABS, 0, 0, 4),
            (JEQ, 1, 0, ARCH),
            (RET, 0, 0, KILL),
            (LD_ABS, 0, 0, 0),
            (JSET, 0, 1, 0x40000000),
            (RET, 0, 0, KILL),
        ];
        for call in [
            libc::SYS_linkat,
            #[cfg(target_arch = "x86_64")]
            libc::SYS_link,
            libc::SYS_ptrace,
            libc::SYS_mount,
            libc::SYS_umount2,
            libc::SYS_setns,
            libc::SYS_unshare,
            libc::SYS_bpf,
            libc::SYS_perf_event_open,
            libc::SYS_keyctl,
            libc::SYS_add_key,
            libc::SYS_request_key,
            libc::SYS_kexec_load,
            libc::SYS_reboot,
            libc::SYS_init_module,
            libc::SYS_finit_module,
            libc::SYS_delete_module,
            libc::SYS_userfaultfd,
            libc::SYS_process_vm_readv,
            libc::SYS_process_vm_writev,
            libc::SYS_pidfd_getfd,
            libc::SYS_open_by_handle_at,
            libc::SYS_name_to_handle_at,
            libc::SYS_io_uring_setup,
            libc::SYS_io_uring_register,
            libc::SYS_io_uring_enter,
        ] {
            instructions.push((JEQ, 0, 1, call as u32));
            instructions.push((RET, 0, 0, ERROR | libc::EPERM as u32));
        }
        instructions.push((JEQ, 0, 1, libc::SYS_clone3 as u32));
        instructions.push((RET, 0, 0, ERROR | libc::ENOSYS as u32));
        let namespaces = (libc::CLONE_NEWNS
            | libc::CLONE_NEWCGROUP
            | libc::CLONE_NEWUTS
            | libc::CLONE_NEWIPC
            | libc::CLONE_NEWUSER
            | libc::CLONE_NEWPID
            | libc::CLONE_NEWNET) as u32;
        instructions.extend([
            (JEQ, 0, 4, libc::SYS_clone as u32),
            (LD_ABS, 0, 0, 16),
            (JSET, 0, 1, namespaces),
            (RET, 0, 0, ERROR | libc::EPERM as u32),
            (RET, 0, 0, ALLOW),
            (RET, 0, 0, ALLOW),
        ]);
        Ok(instructions
            .into_iter()
            .flat_map(|(code, jt, jf, k)| {
                let mut bytes = Vec::with_capacity(8);
                bytes.extend(code.to_ne_bytes());
                bytes.extend([jt, jf]);
                bytes.extend(k.to_ne_bytes());
                bytes
            })
            .collect())
    }
}

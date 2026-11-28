#![cfg(target_os = "linux")]
use ironloom_core::{AssignmentId, WorkerId};
use ironloom_workers::sandbox::{Launch, Runner};
use ironloom_worktrees::factory::{WorkerPaths, WorkerPathsData};
use std::path::Path;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

fn paths() -> WorkerPaths {
    WorkerPaths::new(WorkerPathsData {
        assignment_id: AssignmentId::new("sandbox-assignment").unwrap(),
        worker_id: WorkerId::new("sandbox-worker").unwrap(),
        write_paths: vec!["src".into()],
        artifact_area: "worker".into(),
    })
    .unwrap()
}
fn command(script: &str) -> Vec<String> {
    vec!["/bin/sh".into(), "-c".into(), script.into()]
}
fn runner() -> Runner {
    Runner::new(
        env!("CARGO_BIN_EXE_ironloom").into(),
        "/usr/bin/bwrap".into(),
    )
    .unwrap()
}
fn roots(root: &Path) {
    std::fs::create_dir_all(root.join("workspace/src")).unwrap();
    std::fs::create_dir_all(root.join("artifacts/worker")).unwrap();
    std::fs::write(root.join("workspace/readonly"), "original").unwrap();
}
#[tokio::test]
async fn actual_namespace_seccomp_mounts_confine_writes_and_hide_host_paths_and_descriptors() {
    let root = tempfile::tempdir().unwrap();
    roots(root.path());
    let secret = root.path().join("host-secret");
    std::fs::write(&secret, "fixture-secret-not-a-credential").unwrap();
    std::os::unix::fs::symlink(&secret, root.path().join("workspace/src/escape")).unwrap();
    let mut args = command(
        "set -eu; test \"$HOME\" = /tmp; test ! -e \"$1\"; test ! -e src/escape; echo allowed > src/allowed; echo artifact > /artifacts/result; if echo forbidden > readonly 2>/dev/null; then exit 12; fi; if /usr/bin/unshare -Ur /bin/true 2>/dev/null; then exit 13; fi; for fd in /proc/self/fd/*; do readlink \"$fd\" || true; done",
    );
    args.extend(["fixture".into(), secret.to_str().unwrap().into()]);
    let launch = Launch::new(
        root.path().join("workspace"),
        root.path().join("artifacts"),
        paths(),
        args,
    )
    .unwrap();
    let output = runner()
        .spawn(launch)
        .await
        .unwrap()
        .wait_with_output()
        .await
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        !String::from_utf8_lossy(&output.stdout).contains(root.path().to_str().unwrap()),
        "mount setup descriptors must not reach the worker"
    );
    assert_eq!(
        std::fs::read_to_string(&secret).unwrap(),
        "fixture-secret-not-a-credential"
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("workspace/readonly")).unwrap(),
        "original"
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("workspace/src/allowed")).unwrap(),
        "allowed\n"
    );
    assert_eq!(
        std::fs::read_to_string(root.path().join("artifacts/worker/result")).unwrap(),
        "artifact\n"
    );
}
#[tokio::test]
async fn missing_enforcement_or_symlinked_mount_never_runs_the_command() {
    let root = tempfile::tempdir().unwrap();
    roots(root.path());
    let launch = || {
        Launch::new(
            root.path().join("workspace"),
            root.path().join("artifacts"),
            paths(),
            command("echo forbidden > src/uncontained"),
        )
        .unwrap()
    };
    let missing = Runner::new(
        env!("CARGO_BIN_EXE_ironloom").into(),
        "/missing/required-bubblewrap".into(),
    )
    .unwrap();
    assert!(
        !missing
            .spawn(launch())
            .await
            .unwrap()
            .wait()
            .await
            .unwrap()
            .success()
    );
    assert!(!root.path().join("workspace/src/uncontained").exists());
    std::fs::remove_dir(root.path().join("workspace/src")).unwrap();
    std::os::unix::fs::symlink(
        root.path().join("artifacts/worker"),
        root.path().join("workspace/src"),
    )
    .unwrap();
    assert!(
        !runner()
            .spawn(launch())
            .await
            .unwrap()
            .wait()
            .await
            .unwrap()
            .success()
    );
    assert!(!root.path().join("artifacts/worker/uncontained").exists());
    let mut forbidden = (*paths()).clone();
    forbidden.write_paths = vec![".git".into()];
    assert!(
        Launch::new(
            root.path().join("workspace"),
            root.path().join("artifacts"),
            WorkerPaths::new(forbidden).unwrap(),
            command("true")
        )
        .is_err()
    );
}
fn children(pid: u32) -> Vec<u32> {
    std::fs::read_to_string(format!("/proc/{pid}/task/{pid}/children"))
        .unwrap_or_default()
        .split_whitespace()
        .filter_map(|pid| pid.parse().ok())
        .collect()
}
fn stopped(pid: u32) -> bool {
    let Ok(stat) = std::fs::read_to_string(format!("/proc/{pid}/stat")) else {
        return true;
    };
    stat.rsplit_once(')')
        .is_some_and(|(_, tail)| tail.trim_start().starts_with('Z'))
}
#[tokio::test]
async fn orphan_helper_rejects_a_parent_identity_that_changed_before_containment() {
    let root = tempfile::tempdir().unwrap();
    roots(root.path());
    let launch = Launch::new(
        root.path().join("workspace"),
        root.path().join("artifacts"),
        paths(),
        command("echo orphan > src/orphan"),
    )
    .unwrap();
    let mut child = tokio::process::Command::new(env!("CARGO_BIN_EXE_ironloom"))
        .arg("sandbox-child")
        .env_clear()
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    input
        .write_all(
            &serde_json::to_vec(
                &serde_json::json!({"parent_pid":0,"bwrap":"/usr/bin/bwrap","launch":launch}),
            )
            .unwrap(),
        )
        .await
        .unwrap();
    input.shutdown().await.unwrap();
    drop(input);
    let output = child.wait_with_output().await.unwrap();
    assert!(!output.status.success());
    assert!(!root.path().join("workspace/src/orphan").exists());
    assert!(!String::from_utf8_lossy(&output.stderr).contains(root.path().to_str().unwrap()));
}
#[tokio::test]
async fn killing_owned_sandbox_stops_background_descendants_in_its_pid_namespace() {
    let root = tempfile::tempdir().unwrap();
    roots(root.path());
    let launch = Launch::new(
        root.path().join("workspace"),
        root.path().join("artifacts"),
        paths(),
        command("sleep 120 & echo ready; wait"),
    )
    .unwrap();
    let mut child = runner().spawn(launch).await.unwrap();
    let outer = child.id().unwrap();
    let mut line = String::new();
    tokio::time::timeout(
        std::time::Duration::from_secs(3),
        BufReader::new(child.stdout.take().unwrap()).read_line(&mut line),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(line, "ready\n");
    let mut descendants = children(outer);
    for pid in descendants.clone() {
        descendants.extend(children(pid));
    }
    for pid in descendants.clone() {
        descendants.extend(children(pid));
    }
    assert!(!descendants.is_empty());
    child.kill().await.unwrap();
    child.wait().await.unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(3), async {
        while descendants.iter().any(|pid| !stopped(*pid)) {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

use std::time::Duration;

use ironloom_gates::{CommandGateExecutor, GateCommand, GateExecutor, GateStatus};

#[test]
fn command_gate_executor_runs_allowed_command_with_cwd_env_and_captured_streams() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    std::fs::write(temp.path().join("marker.txt"), "present").expect("marker should be written");
    let mut executor = CommandGateExecutor::new(temp.path()).with_timeout(Duration::from_secs(2));
    executor.allow_command(
        GateCommand::new("inspect", "sh")
            .arg("-c")
            .arg(
                "test -f marker.txt && printf 'out:%s' \"$IRONLOOM_GATE_TEST\" && printf 'err' >&2",
            )
            .env("IRONLOOM_GATE_TEST", "bound"),
    );

    let result = executor.run_gate("inspect");

    assert_eq!(GateStatus::Passed, result.status);
    assert_eq!(0, result.exit_code);
    assert_eq!("out:bound", result.stdout);
    assert_eq!("err", result.stderr);
}

#[test]
fn command_gate_executor_classifies_non_zero_exit_as_failed() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let mut executor = CommandGateExecutor::new(temp.path()).with_timeout(Duration::from_secs(2));
    executor.allow_command(
        GateCommand::new("fail", "sh")
            .arg("-c")
            .arg("printf 'bad' >&2; exit 7"),
    );

    let result = executor.run_gate("fail");

    assert_eq!(GateStatus::Failed, result.status);
    assert_eq!(7, result.exit_code);
    assert_eq!("bad", result.stderr);
}

#[test]
fn command_gate_executor_fails_closed_for_timeout() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let mut executor =
        CommandGateExecutor::new(temp.path()).with_timeout(Duration::from_millis(25));
    executor.allow_command(GateCommand::new("slow", "sh").arg("-c").arg("sleep 2"));

    let result = executor.run_gate("slow");

    assert_eq!(GateStatus::Failed, result.status);
    assert_eq!(-1, result.exit_code);
    assert!(result.stderr.contains("timed out"));
}

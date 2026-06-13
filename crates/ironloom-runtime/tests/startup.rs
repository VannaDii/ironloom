#![forbid(unsafe_code)]

use std::process::Command;

#[test]
fn binary_without_serve_prints_runtime_banner() {
    let output = Command::new(env!("CARGO_BIN_EXE_ironloom"))
        .output()
        .expect("runtime binary should execute");

    assert!(
        output.status.success(),
        "runtime banner command should succeed"
    );
    let stdout = String::from_utf8(output.stdout).expect("stdout should be utf-8");
    assert!(
        stdout.contains("ironloom runtime"),
        "runtime banner should identify the binary"
    );
}

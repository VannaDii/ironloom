#![forbid(unsafe_code)]

use std::process::Command;

#[test]
fn serve_refuses_missing_runtime_configuration_before_binding() {
    let output = Command::new(env!("CARGO_BIN_EXE_ironloom"))
        .arg("serve")
        .env_remove("IRONLOOM_PUBLIC_URL")
        .env_remove("IRONLOOM_STATE_ROOT")
        .env_remove("IRONLOOM_DISCORD_TOKEN")
        .env_remove("IRONLOOM_GITHUB_TOKEN")
        .env_remove("IRONLOOM_SONARCLOUD_TOKEN")
        .output()
        .expect("runtime binary should execute");

    assert!(
        !output.status.success(),
        "runtime should refuse missing startup config"
    );
    let stderr = String::from_utf8(output.stderr).expect("stderr should be utf-8");
    assert!(
        stderr.contains("invalid ironloom runtime configuration"),
        "startup failure should describe invalid runtime configuration"
    );
}

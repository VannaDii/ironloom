#![forbid(unsafe_code)]

use std::process::Command;

use ironloom_discord::{DiscordInteractionRequest, verify_discord_interaction};

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

#[test]
fn binary_signs_discord_fixture_payloads_for_acceptance_tests() {
    let seed = "0707070707070707070707070707070707070707070707070707070707070707";
    let timestamp = "1700000000";
    let body = r#"{"type":1}"#;
    let output = Command::new(env!("CARGO_BIN_EXE_ironloom"))
        .args(["sign-discord-fixture", seed, timestamp, body])
        .output()
        .expect("runtime binary should execute");

    assert!(
        output.status.success(),
        "fixture signing command should succeed"
    );
    let stdout = String::from_utf8(output.stdout).expect("stdout should be utf-8");
    let public_key = output_value(&stdout, "public_key");
    let signature = output_value(&stdout, "signature");

    verify_discord_interaction(&DiscordInteractionRequest {
        public_key,
        signature,
        timestamp: timestamp.to_owned(),
        body: body.to_owned(),
    })
    .expect("signed fixture payload should verify");
}

#[test]
fn binary_external_probe_requires_repository_slug() {
    let output = Command::new(env!("CARGO_BIN_EXE_ironloom"))
        .arg("external-probe")
        .output()
        .expect("runtime binary should execute");

    assert!(!output.status.success(), "missing repository should fail");
    assert_eq!(Some(2), output.status.code());
    assert!(
        String::from_utf8(output.stderr)
            .expect("stderr should be utf-8")
            .contains("usage: ironloom external-probe <github-owner/repo>"),
        "usage should explain the required repository slug"
    );
}

#[test]
fn binary_external_probe_rejects_missing_runtime_config_before_network_calls() {
    let mut command = Command::new(env!("CARGO_BIN_EXE_ironloom"));
    command.args(["external-probe", "VannaDii/ironloom"]);
    for name in [
        "IRONLOOM_PUBLIC_URL",
        "IRONLOOM_STATE_ROOT",
        "IRONLOOM_DISCORD_APPLICATION_ID",
        "IRONLOOM_DISCORD_TOKEN",
        "IRONLOOM_DISCORD_PUBLIC_KEY",
        "IRONLOOM_GITHUB_TOKEN",
        "IRONLOOM_SONARCLOUD_TOKEN",
        "IRONLOOM_SONARCLOUD_ORGANIZATION",
        "IRONLOOM_SONARCLOUD_PROJECT_KEY",
        "IRONLOOM_OPENAI_API_KEY",
        "IRONLOOM_OPENAI_OAUTH_SESSION",
    ] {
        command.env_remove(name);
    }
    let output = command.output().expect("runtime binary should execute");

    assert!(
        !output.status.success(),
        "missing runtime config should fail"
    );
    assert_eq!(Some(1), output.status.code());
    assert!(
        String::from_utf8(output.stderr)
            .expect("stderr should be utf-8")
            .contains("failed to resolve runtime config"),
        "error should explain that runtime config is missing"
    );
}

fn output_value(output: &str, name: &str) -> String {
    output
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{name}=")))
        .expect("output field should exist")
        .to_owned()
}

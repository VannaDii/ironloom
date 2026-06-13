use std::path::PathBuf;

use ironloom_config::{ConfigError, RuntimeConfig};

#[test]
fn runtime_config_rejects_missing_secret_references_before_accepting_work() {
    let config = RuntimeConfig {
        runtime_url: "https://ironloom.dev".to_owned(),
        state_root: PathBuf::from("/var/lib/ironloom"),
        discord_token_ref: "discord-token".to_owned(),
        github_token_ref: String::new(),
        sonarcloud_token_ref: "sonar-token".to_owned(),
    };

    let error = config
        .validate()
        .expect_err("missing GitHub credential must fail startup validation");

    assert!(matches!(
        error,
        ConfigError::EmptySecretRef {
            field: "github_token_ref"
        }
    ));
}

#[test]
fn runtime_config_from_environment_pairs_requires_secret_values() {
    let inputs = [
        ("IRONLOOM_PUBLIC_URL", "https://ironloom.dev"),
        ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
        ("IRONLOOM_DISCORD_TOKEN", "discord-token"),
        ("IRONLOOM_GITHUB_TOKEN", ""),
        ("IRONLOOM_SONARCLOUD_TOKEN", "sonar-token"),
    ];

    let error = RuntimeConfig::from_environment_pairs(inputs)
        .expect_err("empty runtime secret environment values must fail startup validation");

    assert!(matches!(
        error,
        ConfigError::EmptySecretRef {
            field: "github_token_ref"
        }
    ));
}

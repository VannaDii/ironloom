use std::path::PathBuf;

use ironloom_config::{
    ConfigError, ConfigSource, OpenAiAuthConfig, RuntimeConfig, RuntimeConfigInputs,
    SetupEnvironment, StoredSetupConfig,
};

#[test]
fn runtime_config_rejects_missing_secret_references_before_accepting_work() {
    let config = RuntimeConfig {
        runtime_url: "https://ironloom.dev".to_owned(),
        state_root: PathBuf::from("/var/lib/ironloom"),
        discord_application_id: "123456789012345678".to_owned(),
        discord_token_ref: "discord-token".to_owned(),
        discord_public_key_ref: "discord-public-key".to_owned(),
        github_token_ref: String::new(),
        sonarcloud_token_ref: "sonar-token".to_owned(),
        sonarcloud_organization: "sonar-org".to_owned(),
        sonarcloud_project_key: "sonar-project".to_owned(),
        openai_auth: OpenAiAuthConfig::ApiKey {
            api_key_ref: "openai-key".to_owned(),
        },
        sources: Default::default(),
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
        ("IRONLOOM_DISCORD_APPLICATION_ID", "123456789012345678"),
        ("IRONLOOM_DISCORD_TOKEN", "discord-token"),
        ("IRONLOOM_DISCORD_PUBLIC_KEY", "discord-public-key"),
        ("IRONLOOM_GITHUB_TOKEN", ""),
        ("IRONLOOM_SONARCLOUD_TOKEN", "sonar-token"),
        ("IRONLOOM_SONARCLOUD_ORGANIZATION", "sonar-org"),
        ("IRONLOOM_SONARCLOUD_PROJECT_KEY", "sonar-project"),
        ("IRONLOOM_OPENAI_API_KEY", "openai-key"),
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

#[test]
fn setup_environment_requires_config_key_before_setup_inputs_are_accepted() {
    let inputs = [
        ("IRONLOOM_PUBLIC_URL", "https://ironloom.dev"),
        ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
        ("IRONLOOM_INSTALLER_TOKEN", "installer-token"),
    ];

    let error = SetupEnvironment::from_environment_pairs(inputs)
        .expect_err("setup must not accept inputs without an encryption key");

    assert!(matches!(
        error,
        ConfigError::MissingEnvironment {
            name: "IRONLOOM_CONFIG_KEY"
        }
    ));
}

#[test]
fn setup_environment_rejects_invalid_config_key_material() {
    let inputs = [
        ("IRONLOOM_CONFIG_KEY", "not-base64"),
        ("IRONLOOM_INSTALLER_TOKEN", "installer-token"),
    ];

    let error = SetupEnvironment::from_environment_pairs(inputs)
        .expect_err("setup must reject invalid encryption key material");

    assert!(matches!(error, ConfigError::InvalidConfigKey));
}

#[test]
fn runtime_config_prefers_environment_values_over_stored_setup_values() {
    let environment = RuntimeConfigInputs::from_environment_pairs([
        ("IRONLOOM_PUBLIC_URL", "https://env.ironloom.dev"),
        ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
        ("IRONLOOM_DISCORD_APPLICATION_ID", "999999999999999999"),
        ("IRONLOOM_DISCORD_TOKEN", "env-discord-token"),
        ("IRONLOOM_DISCORD_PUBLIC_KEY", "env-discord-public-key"),
        ("IRONLOOM_GITHUB_TOKEN", "env-github-token"),
        ("IRONLOOM_SONARCLOUD_TOKEN", "env-sonar-token"),
        ("IRONLOOM_SONARCLOUD_ORGANIZATION", "env-org"),
        ("IRONLOOM_SONARCLOUD_PROJECT_KEY", "env-project"),
        ("IRONLOOM_OPENAI_API_KEY", "env-openai-key"),
    ]);
    let stored = StoredSetupConfig {
        runtime_url: Some("https://stored.ironloom.dev".to_owned()),
        discord_application_id: Some("123456789012345678".to_owned()),
        discord_token_ref: Some("stored-discord-token".to_owned()),
        discord_public_key_ref: Some("stored-discord-public-key".to_owned()),
        github_token_ref: Some("stored-github-token".to_owned()),
        sonarcloud_token_ref: Some("stored-sonar-token".to_owned()),
        sonarcloud_organization: Some("stored-org".to_owned()),
        sonarcloud_project_key: Some("stored-project".to_owned()),
        openai_api_key_ref: Some("stored-openai-key".to_owned()),
        openai_oauth_session_ref: None,
    };

    let resolved = RuntimeConfig::resolve(environment, Some(&stored))
        .expect("complete environment config should resolve");

    assert_eq!("https://env.ironloom.dev", resolved.runtime_url);
    assert_eq!("999999999999999999", resolved.discord_application_id);
    assert_eq!("env-discord-token", resolved.discord_token_ref);
    assert_eq!("env-discord-public-key", resolved.discord_public_key_ref);
    assert_eq!("env-github-token", resolved.github_token_ref);
    assert_eq!("env-sonar-token", resolved.sonarcloud_token_ref);
    assert_eq!("env-org", resolved.sonarcloud_organization);
    assert_eq!("env-project", resolved.sonarcloud_project_key);
    assert_eq!(
        OpenAiAuthConfig::ApiKey {
            api_key_ref: "env-openai-key".to_owned()
        },
        resolved.openai_auth
    );
    assert_eq!(
        ConfigSource::Environment,
        resolved
            .sources
            .get("discord_token_ref")
            .expect("source should be tracked")
            .clone()
    );
}

#[test]
fn runtime_config_uses_stored_setup_when_environment_is_missing() {
    let environment = RuntimeConfigInputs::from_environment_pairs([(
        "IRONLOOM_STATE_ROOT",
        "/var/lib/ironloom/.ironloom",
    )]);
    let stored = StoredSetupConfig {
        runtime_url: Some("https://stored.ironloom.dev".to_owned()),
        discord_application_id: Some("123456789012345678".to_owned()),
        discord_token_ref: Some("stored-discord-token".to_owned()),
        discord_public_key_ref: Some("stored-discord-public-key".to_owned()),
        github_token_ref: Some("stored-github-token".to_owned()),
        sonarcloud_token_ref: Some("stored-sonar-token".to_owned()),
        sonarcloud_organization: Some("stored-org".to_owned()),
        sonarcloud_project_key: Some("stored-project".to_owned()),
        openai_api_key_ref: None,
        openai_oauth_session_ref: Some("stored-oauth-session".to_owned()),
    };

    let resolved = RuntimeConfig::resolve(environment, Some(&stored))
        .expect("stored setup should complete runtime config when env is absent");

    assert_eq!("https://stored.ironloom.dev", resolved.runtime_url);
    assert_eq!("123456789012345678", resolved.discord_application_id);
    assert_eq!(
        OpenAiAuthConfig::ChatGptOAuth {
            session_ref: "stored-oauth-session".to_owned()
        },
        resolved.openai_auth
    );
    assert_eq!(
        ConfigSource::StoredSetup,
        resolved
            .sources
            .get("openai_auth")
            .expect("source should be tracked")
            .clone()
    );
}

#[test]
fn runtime_config_requires_one_openai_auth_method() {
    let environment = RuntimeConfigInputs::from_environment_pairs([
        ("IRONLOOM_PUBLIC_URL", "https://ironloom.dev"),
        ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
        ("IRONLOOM_DISCORD_APPLICATION_ID", "123456789012345678"),
        ("IRONLOOM_DISCORD_TOKEN", "discord-token"),
        ("IRONLOOM_DISCORD_PUBLIC_KEY", "discord-public-key"),
        ("IRONLOOM_GITHUB_TOKEN", "github-token"),
        ("IRONLOOM_SONARCLOUD_TOKEN", "sonar-token"),
        ("IRONLOOM_SONARCLOUD_ORGANIZATION", "sonar-org"),
        ("IRONLOOM_SONARCLOUD_PROJECT_KEY", "sonar-project"),
    ]);

    let error = RuntimeConfig::resolve(environment, None)
        .expect_err("runtime config must require OpenAI auth");

    assert!(matches!(
        error,
        ConfigError::MissingRuntimeField {
            field: "openai_auth"
        }
    ));
}

#[test]
fn runtime_config_rejects_empty_state_root() {
    let environment = RuntimeConfigInputs::from_environment_pairs([
        ("IRONLOOM_PUBLIC_URL", "https://ironloom.dev"),
        ("IRONLOOM_STATE_ROOT", ""),
        ("IRONLOOM_DISCORD_APPLICATION_ID", "123456789012345678"),
        ("IRONLOOM_DISCORD_TOKEN", "discord-token"),
        ("IRONLOOM_DISCORD_PUBLIC_KEY", "discord-public-key"),
        ("IRONLOOM_GITHUB_TOKEN", "github-token"),
        ("IRONLOOM_SONARCLOUD_TOKEN", "sonar-token"),
        ("IRONLOOM_SONARCLOUD_ORGANIZATION", "sonar-org"),
        ("IRONLOOM_SONARCLOUD_PROJECT_KEY", "sonar-project"),
        ("IRONLOOM_OPENAI_API_KEY", "openai-key"),
    ]);

    let error = RuntimeConfig::resolve(environment, None)
        .expect_err("empty state root must fail runtime config");

    assert!(matches!(
        error,
        ConfigError::EmptySecretRef {
            field: "state_root"
        }
    ));
}

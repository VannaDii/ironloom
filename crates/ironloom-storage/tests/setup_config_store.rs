use ironloom_config::StoredSetupConfig;
use ironloom_storage::{SetupConfigStore, SetupConfigStoreError};

const TEST_CONFIG_KEY: &str = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

#[test]
fn setup_config_store_encrypts_local_config_without_plaintext_secret_leakage() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = SetupConfigStore::new(temp.path());
    let config = StoredSetupConfig {
        runtime_url: Some("https://ironloom.dev".to_owned()),
        discord_application_id: Some("123456789012345678".to_owned()),
        discord_token_ref: Some("discord-secret-value".to_owned()),
        discord_public_key_ref: Some("discord-public-key".to_owned()),
        github_token_ref: Some("github-secret-value".to_owned()),
        sonarcloud_token_ref: Some("sonar-secret-value".to_owned()),
        sonarcloud_organization: Some("sonar-org".to_owned()),
        sonarcloud_project_key: Some("sonar-project".to_owned()),
        openai_api_key_ref: Some("openai-secret-value".to_owned()),
        openai_oauth_session_ref: None,
    };

    store
        .write(TEST_CONFIG_KEY, &config)
        .expect("encrypted setup config should be written");

    let raw = std::fs::read_to_string(store.config_path()).expect("config file should exist");
    assert!(
        !raw.contains("discord-secret-value"),
        "encrypted setup file must not contain plaintext Discord secret"
    );
    assert!(
        !raw.contains("openai-secret-value"),
        "encrypted setup file must not contain plaintext OpenAI secret"
    );

    let decoded = store
        .read(TEST_CONFIG_KEY)
        .expect("encrypted setup config should be readable")
        .expect("setup config should be present");
    assert_eq!(config, decoded);
}

#[test]
fn setup_config_store_rejects_invalid_config_key() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = SetupConfigStore::new(temp.path());

    let error = store
        .read("not-base64")
        .expect_err("invalid config key must not be accepted");

    assert!(matches!(error, SetupConfigStoreError::InvalidConfigKey));
}

#[cfg(unix)]
#[test]
fn setup_config_store_writes_config_file_with_owner_only_permissions() {
    use std::os::unix::fs::PermissionsExt;

    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = SetupConfigStore::new(temp.path());
    store
        .write(TEST_CONFIG_KEY, &StoredSetupConfig::default())
        .expect("encrypted setup config should be written");

    let mode = std::fs::metadata(store.config_path())
        .expect("config metadata should exist")
        .permissions()
        .mode()
        & 0o777;

    assert_eq!(0o600, mode);
}

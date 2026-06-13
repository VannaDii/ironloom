use ironloom_config::{RuntimeConfigInputs, SetupEnvironment, StoredSetupConfig};
use ironloom_runtime::{
    RuntimeHttpContext, SetupFormSubmission, SetupPageModel, SetupSubmissionError,
    handle_runtime_http_request, handle_runtime_http_request_with_store, submit_setup_form,
};
use ironloom_storage::SetupConfigStore;

const CONFIG_KEY: &str = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

#[test]
fn missing_config_key_page_shows_instructions_without_setup_inputs() {
    let model = SetupPageModel::missing_config_key();
    let html = model.render_html();

    assert!(html.contains("IRONLOOM_CONFIG_KEY"));
    assert!(html.contains("kubectl"));
    assert!(html.contains("docker"));
    assert!(!html.contains("name=\"discord_token_ref\""));
    assert!(!html.contains("name=\"openai_api_key_ref\""));
    assert!(!html.contains("<form method=\"post\""));
}

#[test]
fn config_page_locks_environment_values_without_leaking_secret_values() {
    let environment = RuntimeConfigInputs::from_environment_pairs([
        ("IRONLOOM_PUBLIC_URL", "https://env.ironloom.dev"),
        ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
        ("IRONLOOM_DISCORD_TOKEN", "env-discord-token"),
        ("IRONLOOM_DISCORD_PUBLIC_KEY", "env-discord-public-key"),
    ]);
    let setup_environment = SetupEnvironment {
        config_key: CONFIG_KEY.to_owned(),
        installer_token: "installer-token".to_owned(),
    };

    let model = SetupPageModel::from_config_state(&environment, Some(&setup_environment), None);
    let html = model.render_html();

    assert!(html.contains("<form method=\"post\" action=\"/setup\""));
    assert!(html.contains("data-field=\"discord_token_ref\""));
    assert!(html.contains("Provided by environment"));
    assert!(!html.contains("env-discord-token"));
    assert!(html.contains("name=\"github_token_ref\""));
    assert!(html.contains("name=\"openai_api_key_ref\""));
    assert!(html.contains("Start ChatGPT OAuth"));
}

#[test]
fn setup_submission_rejects_invalid_installer_token() {
    let setup_environment = SetupEnvironment {
        config_key: CONFIG_KEY.to_owned(),
        installer_token: "installer-token".to_owned(),
    };
    let submission = SetupFormSubmission::from_pairs([
        ("installer_token", "wrong-token"),
        ("runtime_url", "https://ironloom.dev"),
    ]);

    let error = submit_setup_form(&setup_environment, &submission)
        .expect_err("wrong installer token must be rejected");

    assert!(matches!(error, SetupSubmissionError::InvalidInstallerToken));
}

#[test]
fn setup_submission_maps_api_key_auth_to_stored_config() {
    let setup_environment = SetupEnvironment {
        config_key: CONFIG_KEY.to_owned(),
        installer_token: "installer-token".to_owned(),
    };
    let submission = SetupFormSubmission::from_pairs([
        ("installer_token", "installer-token"),
        ("runtime_url", "https://ironloom.dev"),
        ("discord_token_ref", "discord-token"),
        ("discord_public_key_ref", "discord-public-key"),
        ("github_token_ref", "github-token"),
        ("sonarcloud_token_ref", "sonar-token"),
        ("sonarcloud_organization", "sonar-org"),
        ("sonarcloud_project_key", "sonar-project"),
        ("openai_auth_method", "api_key"),
        ("openai_api_key_ref", "openai-key"),
    ]);

    let stored = submit_setup_form(&setup_environment, &submission)
        .expect("valid setup submission should produce stored config");

    assert_eq!(
        StoredSetupConfig {
            runtime_url: Some("https://ironloom.dev".to_owned()),
            discord_token_ref: Some("discord-token".to_owned()),
            discord_public_key_ref: Some("discord-public-key".to_owned()),
            github_token_ref: Some("github-token".to_owned()),
            sonarcloud_token_ref: Some("sonar-token".to_owned()),
            sonarcloud_organization: Some("sonar-org".to_owned()),
            sonarcloud_project_key: Some("sonar-project".to_owned()),
            openai_api_key_ref: Some("openai-key".to_owned()),
            openai_oauth_session_ref: None,
        },
        stored
    );
}

#[test]
fn setup_submission_maps_oauth_session_to_stored_config() {
    let setup_environment = SetupEnvironment {
        config_key: CONFIG_KEY.to_owned(),
        installer_token: "installer-token".to_owned(),
    };
    let submission = SetupFormSubmission::from_pairs([
        ("installer_token", "installer-token"),
        ("openai_auth_method", "chatgpt_oauth"),
        ("openai_oauth_session_ref", "oauth-session"),
    ]);

    let stored = submit_setup_form(&setup_environment, &submission)
        .expect("valid OAuth setup submission should produce stored config");

    assert_eq!(None, stored.openai_api_key_ref);
    assert_eq!(
        Some("oauth-session".to_owned()),
        stored.openai_oauth_session_ref
    );
}

#[test]
fn runtime_http_serves_key_gate_on_root_when_config_key_is_missing() {
    let context = RuntimeHttpContext::new(
        RuntimeConfigInputs::from_environment_pairs([(
            "IRONLOOM_STATE_ROOT",
            "/var/lib/ironloom/.ironloom",
        )]),
        None,
        None,
    );

    let response = handle_runtime_http_request(&context, "GET / HTTP/1.1\r\n\r\n");

    assert_eq!(200, response.status_code);
    assert!(response.body.contains("IRONLOOM_CONFIG_KEY"));
    assert!(!response.body.contains("<form method=\"post\""));
}

#[test]
fn runtime_http_blocks_readiness_until_runtime_config_is_complete() {
    let context = RuntimeHttpContext::new(
        RuntimeConfigInputs::from_environment_pairs([(
            "IRONLOOM_STATE_ROOT",
            "/var/lib/ironloom/.ironloom",
        )]),
        Some(SetupEnvironment {
            config_key: CONFIG_KEY.to_owned(),
            installer_token: "installer-token".to_owned(),
        }),
        None,
    );

    let response = handle_runtime_http_request(&context, "GET /readyz HTTP/1.1\r\n\r\n");

    assert_eq!(503, response.status_code);
    assert_eq!("setup required", response.body);
}

#[test]
fn runtime_http_reports_ready_when_resolved_config_is_complete() {
    let context = RuntimeHttpContext::new(
        RuntimeConfigInputs::from_environment_pairs([
            ("IRONLOOM_PUBLIC_URL", "https://ironloom.dev"),
            ("IRONLOOM_STATE_ROOT", "/var/lib/ironloom/.ironloom"),
            ("IRONLOOM_DISCORD_TOKEN", "discord-token"),
            ("IRONLOOM_DISCORD_PUBLIC_KEY", "discord-public-key"),
            ("IRONLOOM_GITHUB_TOKEN", "github-token"),
            ("IRONLOOM_SONARCLOUD_TOKEN", "sonar-token"),
            ("IRONLOOM_SONARCLOUD_ORGANIZATION", "sonar-org"),
            ("IRONLOOM_SONARCLOUD_PROJECT_KEY", "sonar-project"),
            ("IRONLOOM_OPENAI_API_KEY", "openai-key"),
        ]),
        Some(SetupEnvironment {
            config_key: CONFIG_KEY.to_owned(),
            installer_token: "installer-token".to_owned(),
        }),
        None,
    );

    let response = handle_runtime_http_request(&context, "GET /readyz HTTP/1.1\r\n\r\n");

    assert_eq!(200, response.status_code);
    assert_eq!("ok", response.body);
}

#[test]
fn runtime_http_post_setup_writes_encrypted_setup_config() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = SetupConfigStore::new(temp.path());
    let setup_environment = SetupEnvironment {
        config_key: CONFIG_KEY.to_owned(),
        installer_token: "installer-token".to_owned(),
    };
    let context = RuntimeHttpContext::new(
        RuntimeConfigInputs::from_environment_pairs([(
            "IRONLOOM_STATE_ROOT",
            temp.path().to_str().expect("path should be utf-8"),
        )]),
        Some(setup_environment.clone()),
        None,
    );
    let request_body = [
        "installer_token=installer-token",
        "runtime_url=https%3A%2F%2Fironloom.dev",
        "discord_token_ref=discord-token",
        "discord_public_key_ref=discord-public-key",
        "github_token_ref=github-token",
        "sonarcloud_token_ref=sonar-token",
        "sonarcloud_organization=sonar-org",
        "sonarcloud_project_key=sonar-project",
        "openai_auth_method=api_key",
        "openai_api_key_ref=openai-key",
    ]
    .join("&");
    let request = format!(
        "POST /setup HTTP/1.1\r\ncontent-length: {}\r\n\r\n{}",
        request_body.len(),
        request_body
    );

    let response = handle_runtime_http_request_with_store(&context, &store, &request);

    assert_eq!(200, response.status_code);
    assert_eq!("setup saved", response.body);
    let stored = store
        .read(CONFIG_KEY)
        .expect("setup config should decrypt")
        .expect("setup config should exist");
    assert_eq!(Some("github-token".to_owned()), stored.github_token_ref);
    assert_eq!(Some("openai-key".to_owned()), stored.openai_api_key_ref);
}

#[test]
fn runtime_http_openai_oauth_start_returns_device_flow_guidance() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let store = SetupConfigStore::new(temp.path());
    let context = RuntimeHttpContext::new(
        RuntimeConfigInputs::from_environment_pairs([(
            "IRONLOOM_STATE_ROOT",
            temp.path().to_str().expect("path should be utf-8"),
        )]),
        Some(SetupEnvironment {
            config_key: CONFIG_KEY.to_owned(),
            installer_token: "installer-token".to_owned(),
        }),
        None,
    );

    let response = handle_runtime_http_request_with_store(
        &context,
        &store,
        "POST /setup/openai/oauth/start HTTP/1.1\r\n\r\n",
    );

    assert_eq!(200, response.status_code);
    assert!(response.body.contains("ChatGPT OAuth"));
    assert!(response.body.contains("chatgptDeviceCode"));
    assert!(response.body.contains("openai_oauth_session_ref"));
}

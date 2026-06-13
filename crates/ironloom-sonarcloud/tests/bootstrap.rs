use ironloom_sonarcloud::{SonarCloudConfig, SonarCloudError};

#[test]
fn missing_project_key_fails_bootstrap_validation() {
    let config = SonarCloudConfig {
        organization: "vannadii".to_owned(),
        project_key: String::new(),
        token_ref: "sonar-token".to_owned(),
    };

    let error = config
        .validate()
        .expect_err("missing project key must fail closed");

    assert!(matches!(
        error,
        SonarCloudError::MissingBootstrapField {
            field: "project_key"
        }
    ));
}

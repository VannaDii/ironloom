use ironloom_core::validation::{ValidationErrors, Wire, decode};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct Fixtures {
    cases: Vec<Case>,
}
#[derive(Deserialize)]
struct Case {
    contract: String,
    name: String,
    input: Value,
    expected_errors: Vec<ironloom_core::validation::FieldError>,
}
fn check<T: Wire>(case: &Case) {
    let result = decode::<T>(&serde_json::to_vec(&case.input).unwrap());
    match result {
        Ok(_) => assert!(
            case.expected_errors.is_empty(),
            "{} accepted invalid data",
            case.name
        ),
        Err(ValidationErrors { fields }) => {
            assert_eq!(fields, case.expected_errors, "{}", case.name)
        }
    }
}
#[test]
fn rust_and_dart_shared_decode_fixtures() {
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    for case in &fixtures.cases {
        match case.contract.as_str() {
            "role_configuration" => check::<ironloom_config::factory::RoleConfiguration>(case),
            "factory_setup" => check::<ironloom_config::factory::FactorySetup>(case),
            "instruction_copy" => check::<ironloom_process_graph::factory::InstructionCopy>(case),
            "command" => check::<ironloom_runtime::factory::Command>(case),
            "usage" => check::<ironloom_observability::factory::Usage>(case),
            "authority_check" => check::<ironloom_policy::factory::AuthorityCheck>(case),
            "lesson" => check::<ironloom_storage::factory::Lesson>(case),
            "login_request" => check::<ironloom_runtime::factory::LoginRequest>(case),
            "replay_cursor" => check::<ironloom_runtime::factory::ReplayCursor>(case),
            "relay_cursor" => check::<ironloom_native::factory::RelayCursor>(case),
            "model_selection" => check::<ironloom_models::factory::ModelSelection>(case),
            "residency" => check::<ironloom_models::factory::Residency>(case),
            "worker_event" => check::<ironloom_workers::factory::WorkerEvent>(case),
            "worker_paths" => check::<ironloom_worktrees::factory::WorkerPaths>(case),
            "factory_artifact" => check::<ironloom_artifacts::factory::FactoryArtifact>(case),
            other => panic!("fixture contract is not exercised: {other}"),
        }
    }
}
#[test]
fn instruction_constructor_and_deserializer_share_cross_field_invariants() {
    use ironloom_core::{AssignmentId, Counter, InstructionId};
    use ironloom_process_graph::factory::{InstructionCopy, InstructionCopyData};
    let data = InstructionCopyData {
        instruction_id: InstructionId::new("i").unwrap(),
        assignment_id: AssignmentId::new("a").unwrap(),
        revision: Counter::new(1),
        acknowledged_revision: Counter::new(2),
        content: "instructions".into(),
    };
    let json = serde_json::to_vec(&data).unwrap();
    assert_eq!(
        InstructionCopy::new(data).unwrap_err().fields[0].field,
        "acknowledged_revision"
    );
    assert!(serde_json::from_slice::<InstructionCopy>(&json).is_err());
    assert_eq!(
        decode::<InstructionCopy>(&json).unwrap_err().fields[0].field,
        "acknowledged_revision"
    );
}
#[test]
fn secrets_never_appear_in_debug_or_decode_failures() {
    use ironloom_runtime::factory::LoginRequest;
    let login: LoginRequest =
        decode(br#"{"username":"operator-1","password":"fixture-secret"}"#).unwrap();
    assert!(!format!("{login:?}").contains("fixture-secret"));
    let invalid = br#"{"username":"operator-1","password":{"value":"fixture-secret"}}"#;
    assert!(
        !decode::<LoginRequest>(invalid)
            .unwrap_err()
            .to_string()
            .contains("fixture-secret")
    );
}
#[test]
fn identities_cannot_bypass_constructors_via_serde() {
    assert!(serde_json::from_str::<ironloom_core::ProjectId>(r#"" ""#).is_err());
    assert!(serde_json::from_str::<ironloom_core::BranchName>(r#""../unsafe""#).is_err());
    assert!(serde_json::from_str::<ironloom_core::RepositorySlug>(r#""missing-owner""#).is_err());
}
#[test]
fn cancellation_and_lru_use_confirmed_execution_not_worker_lifetime() {
    use ironloom_queue::factory::ExecutionState::*;
    assert!(Running.permits(&CancellationRequested));
    assert!(!CancellationRequested.permits(&Completed));
    assert!(CancellationRequested.permits(&Terminated));
    assert!(!Running.permits(&Terminated));
    assert!(!Terminated.permits(&Running));
    let fixtures: Fixtures =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    for case in fixtures
        .cases
        .iter()
        .filter(|case| case.contract == "residency")
    {
        let model: ironloom_models::factory::Residency =
            decode(&serde_json::to_vec(&case.input).unwrap()).unwrap();
        assert_eq!(model.eviction_eligible(), model.active_requests.get() == 0);
    }
}

#[test]
fn durable_sse_cursor_roundtrips_without_resubmitting_commands() {
    use ironloom_runtime::factory::{ReplayCursor, decode_cursor, encode_cursor};
    let cursor: ReplayCursor =
        decode(br#"{"conversation_id":"session:1","sequence":"9007199254740993"}"#).unwrap();
    let header = encode_cursor(&cursor).unwrap();
    assert_eq!(decode_cursor(&header).unwrap(), cursor);
    assert!(decode_cursor("not!a!cursor").is_err());
    assert!(
        decode::<ReplayCursor>(br#"{"conversation_id":"session:1","sequence":"1"} {}"#).is_err()
    );
}

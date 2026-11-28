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
            "session_query" => check::<ironloom_service::factory::SessionQuery>(case),
            "service_event" => check::<ironloom_service::factory::ServiceEvent>(case),
            "instruction_command" => check::<ironloom_service::factory::InstructionCommand>(case),
            "budget_command" => check::<ironloom_service::factory::BudgetCommand>(case),
            "download_limits" => check::<ironloom_config::factory::DownloadLimits>(case),
            "stored_command" => check::<ironloom_storage::factory::StoredCommand>(case),
            "download_progress" => check::<ironloom_models::factory::DownloadProgress>(case),
            "model_inventory_item" => check::<ironloom_service::factory::ModelInventoryItem>(case),
            "model_assessment_query" => {
                check::<ironloom_service::factory::ModelAssessmentQuery>(case)
            }
            "engine_assessment" => check::<ironloom_service::factory::EngineAssessment>(case),
            "project_query" => check::<ironloom_service::factory::ProjectQuery>(case),
            "create_project" => check::<ironloom_service::factory::CreateProject>(case),
            "credential_command" => check::<ironloom_service::factory::CredentialCommand>(case),
            "native_connection_command" => {
                check::<ironloom_service::factory::NativeConnectionCommand>(case)
            }
            "download_command" => check::<ironloom_service::factory::DownloadCommand>(case),

            "create_conversation" => check::<ironloom_service::factory::CreateConversation>(case),
            "source_query" => check::<ironloom_models::factory::SourceQuery>(case),
            "source_page" => check::<ironloom_models::factory::SourcePage>(case),
            "engine_load_options" => check::<ironloom_models::factory::EngineLoadOptions>(case),
            "engine_requirements" => check::<ironloom_models::factory::EngineRequirements>(case),
            "engine_observation" => check::<ironloom_models::factory::EngineObservation>(case),
            "device_observation" => {
                check::<ironloom_models::factory::DeviceResourceObservation>(case)
            }
            "configuration_command" => {
                check::<ironloom_service::factory::ConfigurationCommand>(case)
            }
            "configuration_snapshot" => {
                check::<ironloom_service::factory::ConfigurationSnapshot>(case)
            }
            "lesson_mutation" => check::<ironloom_service::factory::LessonMutation>(case),

            "question_answer" => check::<ironloom_service::factory::QuestionAnswer>(case),
            "pending_question" => check::<ironloom_workers::factory::PendingQuestion>(case),
            "inference_message" => check::<ironloom_models::factory::InferenceMessage>(case),
            "tool_definition" => check::<ironloom_models::factory::ToolDefinition>(case),
            "inference_request" => check::<ironloom_models::factory::InferenceRequest>(case),
            "conversation_snapshot" => {
                check::<ironloom_service::factory::ConversationSnapshot>(case)
            }
            "history_query" => check::<ironloom_service::factory::HistoryQuery>(case),
            "history_page" => check::<ironloom_service::factory::HistoryPage>(case),
            "native_enrollment" => check::<ironloom_service::factory::NativeEnrollment>(case),

            "role_configuration" => check::<ironloom_config::factory::RoleConfiguration>(case),
            "factory_setup" => check::<ironloom_config::factory::FactorySetup>(case),
            "instruction_copy" => check::<ironloom_process_graph::factory::InstructionCopy>(case),
            "command" => check::<ironloom_service::factory::Command>(case),
            "usage" => check::<ironloom_observability::factory::Usage>(case),
            "authority_check" => check::<ironloom_policy::factory::AuthorityCheck>(case),
            "lesson" => check::<ironloom_storage::factory::Lesson>(case),
            "login_request" => check::<ironloom_service::factory::LoginRequest>(case),
            "replay_cursor" => check::<ironloom_service::factory::ReplayCursor>(case),
            "relay_cursor" => check::<ironloom_service::factory::RelayCursor>(case),
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
    use ironloom_service::factory::LoginRequest;
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
    use ironloom_service::factory::{ReplayCursor, decode_cursor, encode_cursor};
    let cursor: ReplayCursor =
        decode(br#"{"conversation_id":"session:1","sequence":"9007199254740993"}"#).unwrap();
    let header = encode_cursor(&cursor).unwrap();
    assert_eq!(decode_cursor(&header).unwrap(), cursor);
    assert!(decode_cursor("not!a!cursor").is_err());
    assert!(
        decode::<ReplayCursor>(br#"{"conversation_id":"session:1","sequence":"1"} {}"#).is_err()
    );
}

#[test]
fn pending_question_modes_validate_choices_and_text_against_recorded_options() {
    use ironloom_core::ActorId;
    use ironloom_workers::factory::{PendingQuestion, PendingQuestionData};
    let fixture: Fixtures =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let data = &fixture
        .cases
        .iter()
        .find(|case| case.name == "multiple-question")
        .unwrap()
        .input;
    let multiple: PendingQuestion = decode(&serde_json::to_vec(data).unwrap()).unwrap();
    let choices = vec![ActorId::new("a").unwrap(), ActorId::new("b").unwrap()];
    multiple
        .validate_response(&choices, Some("Additional detail."))
        .unwrap();
    multiple
        .validate_response(&[], Some("Free-text response."))
        .unwrap();
    let mut single_data: PendingQuestionData = serde_json::from_value(data.clone()).unwrap();
    single_data.allow_multiple = false;
    single_data.allow_text = false;
    let single = PendingQuestion::new(single_data).unwrap();
    assert_eq!(
        single.validate_response(&choices, None).unwrap_err().fields[0].code,
        "multiple_choices_forbidden"
    );
    assert_eq!(
        single
            .validate_response(&[], Some("Not permitted."))
            .unwrap_err()
            .fields[0]
            .code,
        "text_forbidden"
    );
    assert_eq!(
        single
            .validate_response(&[ActorId::new("unknown").unwrap()], None)
            .unwrap_err()
            .fields[0]
            .code,
        "unknown_choice"
    );
}
#[test]
fn provider_message_constructor_and_serde_reject_the_same_invalid_tool_role() {
    use ironloom_models::factory::{InferenceMessage, InferenceMessageData, MessageRole};
    let data = InferenceMessageData {
        role: MessageRole::Tool,
        text: Some("raw untyped result".into()),
        tool_calls: vec![],
        tool_result: None,
    };
    let json = serde_json::to_vec(&data).unwrap();
    let expected = InferenceMessage::new(data).unwrap_err();
    assert_eq!(decode::<InferenceMessage>(&json).unwrap_err(), expected);
    assert!(serde_json::from_slice::<InferenceMessage>(&json).is_err());
}
#[test]
fn native_refresh_is_bound_to_current_enabled_generation() {
    use ironloom_core::Counter;
    use ironloom_service::factory::NativeEnrollment;
    let fixture: Fixtures =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let data = &fixture
        .cases
        .iter()
        .find(|case| case.name == "distinct-relay-and-native-identities")
        .unwrap()
        .input;
    let enrollment: NativeEnrollment = decode(&serde_json::to_vec(data).unwrap()).unwrap();
    assert!(enrollment.accepts_refresh(Counter::new(2)));
    assert!(!enrollment.accepts_refresh(Counter::new(1)));
    assert_ne!(
        enrollment.server_id.as_str(),
        enrollment.environment_id.as_str()
    );
}

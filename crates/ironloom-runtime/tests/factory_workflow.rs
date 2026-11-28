use ironloom_core::*;
use ironloom_policy::live::{Authority, OpenFga, Relationship};
use ironloom_runtime::{
    authentication::AuthenticationBackend,
    authorization::LiveAuthority,
    backend::{BackendInfrastructure, FactoryBackend},
};
use ironloom_service::factory::*;
use ironloom_storage::{
    factory::{FactoryStore, NodeEnrollment, NodeEnrollmentData},
    postgres::{Operation, Store},
    secrets::SecretCipher,
};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
fn id(text: &str) -> ActorId {
    ActorId::new(text).unwrap()
}
fn control(
    command: &str,
    project: &ProjectId,
    assignment: &AssignmentId,
    revision: u64,
    action: &str,
) -> Command {
    serde_json::from_value(json!({"command_id":command,"project_id":project,"expected_revision":revision.to_string(),"action":{"type":"control","data":{"assignment_id":assignment,"action":action}}})).unwrap()
}
#[tokio::test]
#[ignore = "requires fresh IRONLOOM_WORKFLOW_TEST_DATABASE_URL and PostgreSQL-backed IRONLOOM_TEST_OPENFGA_URL"]
async fn human_input_atomically_creates_owned_queue_history_and_instruction_copies() {
    let store = Store::connect(&std::env::var("IRONLOOM_WORKFLOW_TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let installation = id(&format!("workflow-{}", uuid::Uuid::new_v4()));
    store
        .initialize(&installation, b"workflow-fixture-token")
        .await
        .unwrap();
    let authority = Arc::new(
        LiveAuthority::open(
            store.clone(),
            OpenFga::new(std::env::var("IRONLOOM_TEST_OPENFGA_URL").unwrap(), None).unwrap(),
        )
        .await
        .unwrap(),
    );
    let auth = Arc::new(
        AuthenticationBackend::new(
            store.clone(),
            authority.clone(),
            SecretCipher::new(&[8; 32]),
            BTreeMap::new(),
        )
        .await
        .unwrap(),
    );
    let alice = auth
        .register(
            serde_json::from_value(
                json!({"username":"workflow-owner","password":"fixture-password-only"}),
            )
            .unwrap(),
            None,
            Some("workflow-fixture-token"),
        )
        .await
        .unwrap();
    auth.bootstrap(
        alice.session.clone(),
        serde_json::from_value(json!({"token":"workflow-fixture-token"})).unwrap(),
    )
    .await
    .unwrap();
    let bob = auth
        .register(
            serde_json::from_value(
                json!({"username":"workflow-member","password":"fixture-password-only"}),
            )
            .unwrap(),
            Some(alice.session.clone()),
            None,
        )
        .await
        .unwrap();

    let root = tempfile::tempdir().unwrap();
    let node = NodeId::new("workflow-node").unwrap();
    store
        .enroll_node(
            NodeEnrollment::new(NodeEnrollmentData {
                installation_id: InstallationId::new(installation.as_str()).unwrap(),
                node_id: node.clone(),
                host_id: HostId::new("workflow-host").unwrap(),
                approved_by: alice.session.operator_id.clone(),
                public_key: id("fixture-public-key"),
                key_access_ref: CredentialId::new("fixture-key-reference").unwrap(),
                protocol_revision: Counter::new(1),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let backend = FactoryBackend::new(
        store.clone(),
        auth.clone(),
        authority.clone(),
        BackendInfrastructure {
            node_id: node.clone(),
            providers: BTreeSet::from([id("fixture")]),
            engines: vec![],
            devices: vec![],
            sandbox_available: true,
            projects_root: root.path().into(),
        },
    )
    .await
    .unwrap();

    let credential = CredentialId::new("fixture-credential").unwrap();
    let cipher = SecretCipher::new(&[8; 32]);
    let protected = cipher
        .seal(
            "credential:fixture",
            b"inert fixture value, never sent to a provider",
        )
        .unwrap();
    let project = ProjectId::new("workflow-project").unwrap();
    let Operation::Write(mut batch) = store
        .begin(
            &alice.session.operator_id,
            &CommandId::new("prepare-project").unwrap(),
            &json!({"fixture":"prepare"}),
            &id("prepare"),
        )
        .await
        .unwrap()
    else {
        panic!("new fixture")
    };
    batch
        .create_project(&project, "Workflow", Some(&id(node.as_str())))
        .await
        .unwrap();
    batch
        .write_credential(&credential, &alice.session.operator_id, None, &protected)
        .await
        .unwrap();
    (*batch).commit(&json!({"prepared":true})).await.unwrap();
    authority
        .write(
            vec![
                Relationship::new(
                    format!("operator:{}", alice.session.operator_id.as_str()),
                    "owner",
                    format!("project:{}", project.as_str()),
                )
                .unwrap(),
                Relationship::new(
                    format!("operator:{}", alice.session.operator_id.as_str()),
                    "owner",
                    format!("credential:{}", credential.as_str()),
                )
                .unwrap(),
            ],
            vec![],
        )
        .await
        .unwrap();
    let configuration:ConfigurationCommand=serde_json::from_value(json!({"command_id":"setup-workflow","project_id":null,"expected_revision":"1","changes":{"setup":{"lesson_handling":"project_only","delivery_confirmed":true,"publish_branch":false,"merge":false,"deploy":false},"source_accounts":[{"host":"huggingface","access":{"type":"credential","credential_id":credential}}],"endpoints":[{"provider":"fixture","base":"http://127.0.0.1:8099/","dialect":"responses","billing":"api_key","streaming":false,"tools":true,"stream_usage":true,"reasoning_efforts":[]}],"models":[{"profile_id":"fixture-profile","provider":"fixture","model_id":"scripted","generation_controls":{"max_output_tokens":"128","max_duration_ms":"1000","repetition_window":"16"},"credential_id":credential,"billing":"api_key","engine":null,"device_bindings":[]}],"roles":[{"role_id":"product-manager","enabled":true,"model_profile_id":"fixture-profile","reasoning_applicable":false,"reasoning_effort":null,"device_bindings":[],"instructions_id":"product-manager"}]}})).unwrap();
    let config = backend
        .configure(alice.session.clone(), configuration)
        .await
        .unwrap();
    assert!(config.execution_ready, "{:?}", config.unmet_prerequisites);
    assert!(
        !config.endpoints[0].streaming,
        "registered API-key endpoints support bounded nonstreaming normalization"
    );
    assert_eq!(
        backend
            .configuration(alice.session.clone(), None)
            .await
            .unwrap()
            .endpoints,
        config.endpoints
    );
    assert_eq!(config.source_accounts[0].host.as_str(), "huggingface");
    let project_override = |key: &str, revision: u64, endpoints: serde_json::Value| {
        serde_json::from_value(json!({"command_id":key,"project_id":project,"expected_revision":revision.to_string(),"changes":{"endpoints":endpoints}})).unwrap()
    };
    let unavailable = backend
        .configure(
            alice.session.clone(),
            project_override("clear-project-endpoints", 1, json!([])),
        )
        .await
        .unwrap();
    assert!(!unavailable.execution_ready);
    assert!(unavailable.endpoints.is_empty());
    assert_eq!(unavailable.source_accounts, config.source_accounts);
    let restored = backend
        .configure(
            alice.session.clone(),
            project_override(
                "set-project-endpoints",
                2,
                serde_json::to_value(&config.endpoints).unwrap(),
            ),
        )
        .await
        .unwrap();
    assert!(restored.execution_ready);
    assert_eq!(restored.endpoints, config.endpoints);
    let bob_user = format!("operator:{}", bob.session.operator_id.as_str());
    let alice_user = format!("operator:{}", alice.session.operator_id.as_str());
    let credential_object = format!("credential:{}", credential.as_str());
    authority
        .write(
            vec![
                Relationship::new(
                    &bob_user,
                    "manager",
                    format!("project:{}", project.as_str()),
                )
                .unwrap(),
                Relationship::new(&bob_user, "user", &credential_object).unwrap(),
            ],
            vec![],
        )
        .await
        .unwrap();
    let mut redirected = serde_json::to_value(&config.endpoints).unwrap();
    redirected[0]["base"] = json!("https://unapproved.example.test/");
    assert!(matches!(
        backend
            .configure(
                bob.session.clone(),
                project_override("use-only-cannot-redirect", 3, redirected.clone())
            )
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    let unchanged:ConfigurationCommand=serde_json::from_value(json!({"command_id":"use-existing-source-binding","project_id":project,"expected_revision":"3","changes":{"source_accounts":config.source_accounts}})).unwrap();
    let preserved = backend
        .configure(bob.session.clone(), unchanged)
        .await
        .unwrap();
    assert_eq!(preserved.endpoints, config.endpoints);
    let source_redirect:ConfigurationCommand=serde_json::from_value(json!({"command_id":"use-only-cannot-change-source-host","project_id":project,"expected_revision":"4","changes":{"source_accounts":[{"host":"different-source-host","access":{"type":"credential","credential_id":credential}}]}})).unwrap();
    assert!(matches!(
        backend
            .configure(bob.session.clone(), source_redirect)
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    assert_eq!(
        backend
            .configuration(bob.session.clone(), Some(project.clone()))
            .await
            .unwrap()
            .revision
            .get(),
        4
    );
    // A global endpoint change also checks credentials present only in private project overrides.
    let private_project = ProjectId::new("private-credential-binding").unwrap();
    let Operation::Write(mut seed) = store
        .begin(
            &bob.session.operator_id,
            &CommandId::new("seed-private-binding-project").unwrap(),
            &json!({}),
            &id("binding-fixture"),
        )
        .await
        .unwrap()
    else {
        panic!("new private fixture")
    };
    seed.create_project(
        &private_project,
        "Private binding",
        Some(&id(node.as_str())),
    )
    .await
    .unwrap();
    (*seed).commit(&json!({"created":true})).await.unwrap();
    authority
        .write(
            vec![
                Relationship::new(
                    &bob_user,
                    "owner",
                    format!("project:{}", private_project.as_str()),
                )
                .unwrap(),
            ],
            vec![],
        )
        .await
        .unwrap();
    backend.configure(bob.session.clone(),serde_json::from_value(json!({"command_id":"retain-private-model-selection","project_id":private_project,"expected_revision":"1","changes":{"roles":config.roles,"models":config.models}})).unwrap()).await.unwrap();
    backend.configure(alice.session.clone(),serde_json::from_value(json!({"command_id":"clear-global-model-selection","project_id":null,"expected_revision":"2","changes":{"roles":[],"models":[]}})).unwrap()).await.unwrap();
    authority
        .write(
            vec![Relationship::new(&alice_user, "user", &credential_object).unwrap()],
            vec![Relationship::new(&alice_user, "owner", &credential_object).unwrap()],
        )
        .await
        .unwrap();
    assert!(matches!(
        backend
            .configuration(alice.session.clone(), Some(private_project))
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    assert!(matches!(backend.configure(alice.session.clone(),serde_json::from_value(json!({"command_id":"global-admin-cannot-redirect-private-credential","project_id":null,"expected_revision":"3","changes":{"endpoints":redirected}})).unwrap()).await,Err(ServiceError::Authentication(AuthenticationError::Forbidden))));
    let unchanged = backend
        .configuration(alice.session.clone(), None)
        .await
        .unwrap();
    assert_eq!(unchanged.revision.get(), 3);
    assert_eq!(unchanged.endpoints, config.endpoints);
    authority
        .write(
            vec![Relationship::new(&alice_user, "owner", &credential_object).unwrap()],
            vec![
                Relationship::new(&alice_user, "user", &credential_object).unwrap(),
                Relationship::new(
                    &bob_user,
                    "manager",
                    format!("project:{}", project.as_str()),
                )
                .unwrap(),
            ],
        )
        .await
        .unwrap();
    backend.configure(alice.session.clone(),serde_json::from_value(json!({"command_id":"restore-global-model-selection","project_id":null,"expected_revision":"3","changes":{"roles":config.roles,"models":config.models}})).unwrap()).await.unwrap();

    let initial = backend
        .create_conversation(
            alice.session.clone(),
            CreateConversation::new(CreateConversationData {
                command_id: CommandId::new("workflow-conversation").unwrap(),
                project_id: project.clone(),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let command:Command=serde_json::from_value(json!({"command_id":"human-idea","project_id":project,"expected_revision":"1","action":{"type":"input","data":{"conversation_id":initial.session.conversation_id,"text":"Build the deterministic fixture project; do not run a model."}}})).unwrap();
    let (a, b) = tokio::join!(
        backend.command(alice.session.clone(), command.clone()),
        backend.command(alice.session.clone(), command.clone())
    );
    let a = a.unwrap();
    let b = b.unwrap();
    assert_ne!(a.disposition, b.disposition);
    assert_eq!(a.cursor, b.cursor);
    let snapshot = backend
        .snapshot(
            alice.session.clone(),
            initial.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(
        snapshot.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Queued)
    );
    assert_eq!(snapshot.revision.get(), 2);
    let assignment = snapshot.active_assignment_id.clone().unwrap();
    let turn = snapshot.session.active_turn_id.clone().unwrap();
    assert_eq!(snapshot.cursor.sequence.get(), 1);
    let history = backend
        .history(
            alice.session.clone(),
            HistoryQuery::new(HistoryQueryData {
                as_of: snapshot.cursor.clone(),
                direction: HistoryDirection::Forward,
                before: None,
                after: None,
                turn_id: Some(turn.clone()),
                limit: Counter::new(10),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(history.items.len(), 1);
    assert_eq!(
        history.items[0].message.role,
        ironloom_models::factory::MessageRole::User
    );
    assert_eq!(
        history.items[0].message.text.as_deref(),
        Some("Build the deterministic fixture project; do not run a model.")
    );
    assert_eq!(history.items[0].turn_id, turn);
    let run = store
        .get("assignment", &id(assignment.as_str()))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(run.assignment.as_ref(), Some(&assignment));
    assert_eq!(run.body["operator_id"], json!(alice.session.operator_id));
    assert_eq!(run.body["owner_node"], json!(node));
    assert_eq!(run.body["next_roles"], json!(["product-manager"]));
    let copy = store
        .get(
            "instruction_copy",
            &id(&format!("{}:product-manager", assignment.as_str())),
        )
        .await
        .unwrap()
        .unwrap();
    let copy: ironloom_process_graph::factory::InstructionCopy =
        serde_json::from_value(copy.body).unwrap();
    assert_eq!(copy.assignment_id, assignment);
    assert_eq!(copy.acknowledged_revision.get(), 0);
    assert!(copy.content.contains("Refine the human's idea"));
    let original_copies = backend
        .instruction_copies(alice.session.clone(), assignment.clone())
        .await
        .unwrap();
    assert_eq!(original_copies.len(), 1);
    assert_eq!(original_copies[0].acknowledged_revision.get(), 0);
    assert!(matches!(
        backend
            .instruction_copies(bob.session.clone(), assignment.clone())
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    for (command, revision, update, content) in [
        ("preserve-active-instructions", 1, false, "New work only"),
        (
            "update-active-instructions",
            2,
            true,
            "Apply at the next controllable boundary",
        ),
    ] {
        backend.instruction(alice.session.clone(),InstructionCommand::new(InstructionCommandData{command_id:CommandId::new(command).unwrap(),project_id:None,instruction_id:InstructionId::new("product-manager").unwrap(),expected_revision:Counter::new(revision),content:content.into(),active_update:if update {ironloom_process_graph::factory::ActiveInstructionUpdate::UpdateSelectedCopies}else{ironloom_process_graph::factory::ActiveInstructionUpdate::PreserveCopies},assignments:if update {vec![assignment.clone()]}else{vec![]}}).unwrap()).await.unwrap();
        let copies = backend
            .instruction_copies(alice.session.clone(), assignment.clone())
            .await
            .unwrap();
        assert_eq!(
            copies[0].acknowledged_revision.get(),
            0,
            "an unstarted worker has not acknowledged an update"
        );
        if update {
            assert_eq!(copies[0].content, content);
            assert_eq!(copies[0].revision.get(), 2);
        } else {
            assert_eq!(copies[0].content, original_copies[0].content);
        }
    }

    let mut another = (*command).clone();
    another.command_id = CommandId::new("another-idea-during-turn").unwrap();
    another.expected_revision = Counter::new(2);
    assert!(matches!(
        backend
            .command(alice.session.clone(), Command::new(another).unwrap())
            .await,
        Err(ServiceError::Conflict)
    ));
    assert!(matches!(
        backend.command(bob.session.clone(), command.clone()).await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    let pause = control("pause-queued", &project, &assignment, 2, "pause");
    backend
        .command(alice.session.clone(), pause.clone())
        .await
        .unwrap();
    let paused = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(
        paused.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Paused)
    );
    assert_eq!(paused.pause_requested, Some(false));
    assert!(
        store
            .claim_next(
                &node,
                &id("paused-instance"),
                std::time::Duration::from_secs(30)
            )
            .await
            .unwrap()
            .is_none()
    );
    backend
        .command(
            alice.session.clone(),
            control("resume-queued", &project, &assignment, 3, "resume"),
        )
        .await
        .unwrap();
    let steer:Command=serde_json::from_value(json!({"command_id":"steer-original-turn","project_id":project,"expected_revision":"4","action":{"type":"steer","data":{"conversation_id":snapshot.session.conversation_id,"expected_turn_id":turn,"text":"Keep the original scope and preserve this exact wording."}}})).unwrap();
    backend
        .command(alice.session.clone(), steer.clone())
        .await
        .unwrap();
    assert_eq!(
        backend
            .command(alice.session.clone(), pause)
            .await
            .unwrap()
            .disposition,
        CommandDisposition::Replayed
    );
    let lease = store
        .claim_next(
            &node,
            &id("fixture-instance"),
            std::time::Duration::from_secs(30),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(lease.assignment_id, assignment);
    assert_eq!(lease.project_id, project);
    assert_eq!(
        lease.body["conversation_id"],
        json!(snapshot.session.conversation_id)
    );
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let mut request = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["name"] == "role-and-tool-roundtrip")
        .unwrap()["input"]
        .clone();
    let inference = InferenceId::new("prepared-only-no-model-call").unwrap();
    let worker = WorkerId::new("prepared-worker").unwrap();
    request["assignment_id"] = json!(assignment);
    request["worker_id"] = json!(worker);
    request["inference_id"] = json!(inference);
    request["turn_id"] = json!(turn);
    let Operation::Write(mut batch) = store
        .begin(
            &alice.session.operator_id,
            &CommandId::new("prepare-never-dispatched").unwrap(),
            &json!({"fixture":"not-dispatched"}),
            &id("prepare-io"),
        )
        .await
        .unwrap()
    else {
        panic!("new IO fixture")
    };
    assert!(
        batch
            .prepare_inference(&lease, &worker, &inference, &request)
            .await
            .unwrap()
    );
    (*batch).commit(&json!({"prepared":true})).await.unwrap();
    backend
        .command(
            alice.session.clone(),
            control(
                "request-pause-at-boundary",
                &project,
                &assignment,
                5,
                "pause",
            ),
        )
        .await
        .unwrap();
    let pending = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(pending.pause_requested, Some(true));
    assert_ne!(
        pending.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Paused)
    );
    assert!(
        backend
            .reconcile_control_boundary(&lease)
            .await
            .unwrap()
            .is_none()
    );
    let Operation::Write(mut batch) = store
        .begin(
            &alice.session.operator_id,
            &CommandId::new("confirm-never-dispatched").unwrap(),
            &json!({"fixture":"confirmed-not-started"}),
            &id("observe-io"),
        )
        .await
        .unwrap()
    else {
        panic!("new IO observation")
    };
    batch
        .observe_inference(
            &lease,
            &inference,
            ironloom_storage::postgres::requests::InferenceState::NotStarted,
            Some(&json!({"adapter_called":false})),
        )
        .await
        .unwrap();
    (*batch).commit(&json!({"observed":true})).await.unwrap();
    backend
        .reconcile_control_boundary(&lease)
        .await
        .unwrap()
        .unwrap();
    let confirmed = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(
        confirmed.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Paused)
    );
    assert_eq!(confirmed.pause_requested, Some(false));
    assert_eq!(
        confirmed.session.last_human_interaction_ms, pending.session.last_human_interaction_ms,
        "background observations must not reorder the dashboard"
    );
    backend
        .command(
            alice.session.clone(),
            control("resume-confirmed-pause", &project, &assignment, 7, "resume"),
        )
        .await
        .unwrap();
    let lease = store
        .claim_next(
            &node,
            &id("resumed-instance"),
            std::time::Duration::from_secs(30),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(lease.fence.get(), 2);
    // Claiming with no I/O still requires the actual owner's pause acknowledgment/yield.
    backend
        .command(
            alice.session.clone(),
            control("pause-claimed-idle", &project, &assignment, 8, "pause"),
        )
        .await
        .unwrap();
    let idle_pause = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(idle_pause.pause_requested, Some(true));
    assert_ne!(
        idle_pause.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Paused)
    );
    backend
        .reconcile_control_boundary(&lease)
        .await
        .unwrap()
        .unwrap();
    let idle_confirmed = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(idle_confirmed.pause_requested, Some(false));
    assert_eq!(
        idle_confirmed.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Paused)
    );
    assert!(
        store
            .claim_next(
                &node,
                &id("cannot-claim-paused"),
                std::time::Duration::from_secs(30)
            )
            .await
            .unwrap()
            .is_none()
    );
    backend
        .command(
            alice.session.clone(),
            control("resume-claimed-idle", &project, &assignment, 10, "resume"),
        )
        .await
        .unwrap();
    let lease = store
        .claim_next(
            &node,
            &id("idle-resumed-instance"),
            std::time::Duration::from_secs(30),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(lease.fence.get(), 3);
    backend
        .command(
            alice.session.clone(),
            control("request-cancel", &project, &assignment, 11, "cancel"),
        )
        .await
        .unwrap();
    let requested = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(
        requested.execution_state,
        Some(ironloom_queue::factory::ExecutionState::CancellationRequested)
    );
    let cancelled = backend
        .reconcile_control_boundary(&lease)
        .await
        .unwrap()
        .unwrap();
    let terminated = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    assert_eq!(
        terminated.execution_state,
        Some(ironloom_queue::factory::ExecutionState::Terminated)
    );
    assert!(terminated.active_assignment_id.is_none());
    assert!(terminated.session.active_turn_id.is_none());
    assert!(terminated.pause_requested.is_none());
    assert_eq!(
        terminated.session.last_human_interaction_ms,
        requested.session.last_human_interaction_ms
    );
    assert_eq!(cancelled.cursor.as_ref(), Some(&terminated.cursor));
    let turn_record = store
        .get("turn", &id(turn.as_str()))
        .await
        .unwrap()
        .unwrap();
    assert!(turn_record.body["started_at_ms"].is_null());
    assert!(turn_record.body["completed_at_ms"].is_string());
    assert_eq!(
        backend
            .command(alice.session.clone(), steer)
            .await
            .unwrap()
            .disposition,
        CommandDisposition::Replayed,
        "replay must precede mutable active-turn checks"
    );
    // Native history uses persisted outcomes at the consumed watermark, never current idle state.
    let window =
        |as_of, anchor, forward, inclusive, limit| ironloom_storage::postgres::TurnWindow {
            conversation: &snapshot.session.conversation_id,
            as_of,
            anchor,
            forward,
            inclusive,
            limit,
        };
    assert!(
        store
            .turns(window(0, None, true, false, 100))
            .await
            .unwrap()
            .is_empty()
    );
    for (sequence, state) in [(1, "queued"), (2, "paused"), (12, "terminated")] {
        let rows = store
            .turns(window(sequence, None, true, false, 100))
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].0, turn);
        assert_eq!(rows[0].1["state"], state);
    }
    let history = backend
        .history(
            alice.session.clone(),
            HistoryQuery::new(HistoryQueryData {
                as_of: terminated.cursor.clone(),
                direction: HistoryDirection::Forward,
                before: None,
                after: None,
                turn_id: Some(turn.clone()),
                limit: Counter::new(100),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(history.items.len(), 2);
    let requested_ids = vec![
        history.items[1].item_id.clone(),
        history.items[0].item_id.clone(),
    ];
    let exact = store
        .history_items(&snapshot.session.conversation_id, 12, &turn, &requested_ids)
        .await
        .unwrap();
    assert_eq!(exact[0]["item_id"], json!(history.items[0].item_id));
    assert_eq!(exact[1]["item_id"], json!(history.items[1].item_id));
    assert!(matches!(
        store
            .history_items(&snapshot.session.conversation_id, 1, &turn, &requested_ids)
            .await,
        Err(ironloom_storage::postgres::DatabaseError::NotFound)
    ));
    assert!(matches!(
        store
            .history_items(
                &snapshot.session.conversation_id,
                12,
                &TurnId::new("foreign-turn").unwrap(),
                &requested_ids
            )
            .await,
        Err(ironloom_storage::postgres::DatabaseError::NotFound)
    ));
    assert!(matches!(
        store
            .history_items(
                &snapshot.session.conversation_id,
                12,
                &turn,
                &[requested_ids[0].clone(), requested_ids[0].clone()]
            )
            .await,
        Err(ironloom_storage::postgres::DatabaseError::Conflict)
    ));
    let second:Command=serde_json::from_value(json!({"command_id":"second-explicit-turn","project_id":project,"expected_revision":terminated.revision,"action":{"type":"input","data":{"conversation_id":snapshot.session.conversation_id,"text":"Second explicit turn; no provider call."}}})).unwrap();
    backend
        .command(alice.session.clone(), second)
        .await
        .unwrap();
    let second = backend
        .snapshot(
            alice.session.clone(),
            snapshot.session.conversation_id.clone(),
        )
        .await
        .unwrap();
    let second_turn = second.session.active_turn_id.clone().unwrap();
    let second_assignment = second.active_assignment_id.clone().unwrap();
    assert_ne!(second_turn, turn);
    assert!(matches!(
        store
            .turns(window(12, Some(&second_turn), true, false, 100))
            .await,
        Err(ironloom_storage::postgres::DatabaseError::Conflict)
    ));
    assert_eq!(
        store.turns(window(13, None, true, false, 1)).await.unwrap()[0].0,
        turn
    );
    assert_eq!(
        store
            .turns(window(13, None, false, false, 1))
            .await
            .unwrap()[0]
            .0,
        second_turn
    );
    assert_eq!(
        store
            .turns(window(13, Some(&turn), true, false, 100))
            .await
            .unwrap()[0]
            .0,
        second_turn
    );
    assert_eq!(
        store
            .turns(window(13, Some(&second_turn), false, false, 100))
            .await
            .unwrap()[0]
            .0,
        turn
    );
    assert_eq!(
        store
            .turns(window(13, Some(&second_turn), false, true, 1))
            .await
            .unwrap()[0]
            .0,
        second_turn
    );
    assert!(
        store
            .turns(window(13, Some(&second_turn), true, false, 100))
            .await
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        store.turns(window(u64::MAX, None, true, false, 100)).await,
        Err(ironloom_storage::postgres::DatabaseError::Conflict)
    ));
    backend
        .command(
            alice.session.clone(),
            control(
                "cancel-second-turn",
                &project,
                &second_assignment,
                second.revision.get(),
                "cancel",
            ),
        )
        .await
        .unwrap();
    let second_lease = store
        .claim_next(
            &node,
            &id("second-turn-owner"),
            std::time::Duration::from_secs(30),
        )
        .await
        .unwrap()
        .unwrap();
    assert_eq!(second_lease.assignment_id, second_assignment);
    backend
        .reconcile_control_boundary(&second_lease)
        .await
        .unwrap()
        .unwrap();
    // Accepted command replay is independent from later editable model/team configuration.
    backend.configure(alice.session.clone(),serde_json::from_value(json!({"command_id":"disable-team","project_id":null,"expected_revision":"4","changes":{"roles":[],"models":[]}})).unwrap()).await.unwrap();
    let replay = backend
        .command(alice.session.clone(), command)
        .await
        .unwrap();
    assert_eq!(replay.disposition, CommandDisposition::Replayed);
    assert_eq!(
        store
            .events(&snapshot.session.conversation_id, 0, 100)
            .await
            .unwrap()
            .len(),
        15
    );
    assert!(
        store
            .claim_next(
                &node,
                &id("another-instance"),
                std::time::Duration::from_secs(30)
            )
            .await
            .unwrap()
            .is_none()
    );
    store.close().await;
}

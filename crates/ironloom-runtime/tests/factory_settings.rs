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
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
fn id(value: &str) -> ActorId {
    ActorId::new(value).unwrap()
}
fn config(command: &str, revision: u64, changes: Value) -> ConfigurationCommand {
    serde_json::from_value(json!({"command_id":command,"project_id":null,"expected_revision":revision.to_string(),"changes":changes})).unwrap()
}
fn edit(
    command: &str,
    revision: u64,
    content: &str,
    assignments: Vec<AssignmentId>,
) -> InstructionCommand {
    InstructionCommand::new(InstructionCommandData {
        command_id: CommandId::new(command).unwrap(),
        project_id: None,
        instruction_id: InstructionId::new("planner").unwrap(),
        expected_revision: Counter::new(revision),
        content: content.into(),
        active_update: if assignments.is_empty() {
            ironloom_process_graph::factory::ActiveInstructionUpdate::PreserveCopies
        } else {
            ironloom_process_graph::factory::ActiveInstructionUpdate::UpdateSelectedCopies
        },
        assignments,
    })
    .unwrap()
}
#[tokio::test]
#[ignore = "requires fresh IRONLOOM_SETTINGS_TEST_DATABASE_URL and PostgreSQL-backed IRONLOOM_TEST_OPENFGA_URL"]
async fn durable_settings_before_projects_and_explicit_copy_updates_keep_revision_authority() {
    let url = std::env::var("IRONLOOM_SETTINGS_TEST_DATABASE_URL").unwrap();
    let fga = std::env::var("IRONLOOM_TEST_OPENFGA_URL").unwrap();
    let store = Store::connect(&url).await.unwrap();
    let installation = id(&format!("settings-{}", uuid::Uuid::new_v4()));
    store
        .initialize(&installation, b"settings-token")
        .await
        .unwrap();
    let authority = Arc::new(
        LiveAuthority::open(store.clone(), OpenFga::new(fga, None).unwrap())
            .await
            .unwrap(),
    );
    let auth = Arc::new(
        AuthenticationBackend::new(
            store.clone(),
            authority.clone(),
            SecretCipher::new(&[7; 32]),
            BTreeMap::new(),
        )
        .await
        .unwrap(),
    );
    let grant = auth
        .register(
            serde_json::from_value(
                json!({"username":"settings-owner","password":"fixture-password-only"}),
            )
            .unwrap(),
            None,
            Some("settings-token"),
        )
        .await
        .unwrap();
    auth.bootstrap(
        grant.session.clone(),
        serde_json::from_value(json!({"token":"settings-token"})).unwrap(),
    )
    .await
    .unwrap();
    let root = tempfile::tempdir().unwrap();
    let node = NodeId::new("settings-node").unwrap();
    let backend = FactoryBackend::new(
        store.clone(),
        auth.clone(),
        authority.clone(),
        BackendInfrastructure {
            node_id: node.clone(),
            providers: BTreeSet::from([id("fixture-provider")]),
            engines: vec![],
            devices: vec![],
            sandbox_available: true,
            projects_root: root.path().into(),
        },
    )
    .await
    .unwrap();
    let session = grant.session;
    let initial = backend.configuration(session.clone(), None).await.unwrap();
    assert_eq!(initial.revision.get(), 1);
    assert!(initial.setup.is_none());
    assert!(!initial.execution_ready);
    let setup = config(
        "initial-settings",
        1,
        json!({"setup":{"lesson_handling":"project_only","delivery_confirmed":true,"publish_branch":true,"merge":false,"deploy":false}}),
    );
    let result = backend
        .configure(session.clone(), setup.clone())
        .await
        .unwrap();
    assert_eq!(result.revision.get(), 2);
    assert!(result.setup.is_some());
    assert_eq!(
        backend.configure(session.clone(), setup).await.unwrap(),
        result
    );
    assert!(matches!(
        backend
            .configure(
                session.clone(),
                config("initial-settings", 1, json!({"roles":[]}))
            )
            .await,
        Err(ServiceError::Conflict)
    ));
    // Same revision from independent callers cannot both win, even on the first settings scope.
    let first = config("settings-a", 2, json!({"device_preferences":[]}));
    let second = config("settings-b", 2, json!({"roles":[]}));
    let (a, b) = tokio::join!(
        backend.configure(session.clone(), first),
        backend.configure(session.clone(), second)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let current = backend.configuration(session.clone(), None).await.unwrap();
    assert_eq!(current.revision.get(), 3);
    store
        .enroll_node(
            NodeEnrollment::new(NodeEnrollmentData {
                installation_id: InstallationId::new(installation.as_str()).unwrap(),
                node_id: node,
                host_id: HostId::new("cpu-fixture").unwrap(),
                approved_by: session.operator_id.clone(),
                public_key: id("fixture-public-key"),
                key_access_ref: CredentialId::new("fixture-key-reference").unwrap(),
                protocol_revision: Counter::new(1),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let project = ProjectId::new("settings-project").unwrap();
    let assignment = AssignmentId::new("settings-assignment").unwrap();
    let worker = id("settings-worker");
    let Operation::Write(mut seed) = store
        .begin(
            &session.operator_id,
            &CommandId::new("prepare-assignment-fixture").unwrap(),
            &json!({}),
            &id("fixture-seed"),
        )
        .await
        .unwrap()
    else {
        panic!("new fixture command");
    };
    seed.create_project(&project, "Settings fixture", None)
        .await
        .unwrap();
    seed.put(
        "assignment",
        &id(assignment.as_str()),
        Some(&project),
        None,
        None,
        &json!({"project_id":project,"state":"running"}),
    )
    .await
    .unwrap();
    seed.put("instruction_copy",&worker,Some(&project),Some(&id(assignment.as_str())),None,&json!({"instruction_id":"planner","assignment_id":assignment,"revision":"1","acknowledged_revision":"1","content":"Original copied instructions"})).await.unwrap();
    (*seed).commit(&json!({"prepared":true})).await.unwrap();
    authority
        .write(
            vec![
                Relationship::new(
                    format!("operator:{}", session.operator_id.as_str()),
                    "owner",
                    "project:settings-project",
                )
                .unwrap(),
                Relationship::new(
                    "project:settings-project",
                    "project",
                    "assignment:settings-assignment",
                )
                .unwrap(),
            ],
            vec![],
        )
        .await
        .unwrap();
    let page = backend
        .instructions(
            session.clone(),
            InstructionQuery::new(InstructionQueryData {
                project_id: None,
                after: None,
                limit: Counter::new(100),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(page.instructions.len(), 7);
    backend
        .instruction(
            session.clone(),
            edit(
                "preserve-instructions",
                1,
                "New template for future assignments",
                vec![],
            ),
        )
        .await
        .unwrap();
    let copy: ironloom_process_graph::factory::InstructionCopy = serde_json::from_value(
        store
            .get("instruction_copy", &worker)
            .await
            .unwrap()
            .unwrap()
            .body,
    )
    .unwrap();
    assert_eq!(copy.content, "Original copied instructions");
    assert_eq!(copy.acknowledged_revision.get(), 1);
    let selected = edit(
        "update-active-instructions",
        2,
        "Explicit active assignment update",
        vec![assignment],
    );
    let changed = backend
        .instruction(session.clone(), selected.clone())
        .await
        .unwrap();
    assert_eq!(changed.revision.get(), 3);
    assert_eq!(
        backend.instruction(session, selected).await.unwrap(),
        changed
    );
    let copy: ironloom_process_graph::factory::InstructionCopy = serde_json::from_value(
        store
            .get("instruction_copy", &worker)
            .await
            .unwrap()
            .unwrap()
            .body,
    )
    .unwrap();
    assert_eq!(copy.content, "Explicit active assignment update");
    assert_eq!(copy.revision.get(), 2);
    assert_eq!(
        copy.acknowledged_revision.get(),
        1,
        "template update cannot forge worker acknowledgment"
    );
    store.close().await;
}

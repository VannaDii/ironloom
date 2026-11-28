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
struct Boundary {
    inner: Arc<LiveAuthority>,
    hold: std::sync::atomic::AtomicBool,
    reached: tokio::sync::Notify,
    released: tokio::sync::Notify,
}
impl Authority for Boundary {
    fn check(
        &self,
        request: ironloom_policy::factory::AuthorityCheck,
    ) -> BoxFuture<'_, ironloom_policy::factory::AuthorizationOutcome> {
        Box::pin(async move {
            let pause = request.resource.kind
                == ironloom_policy::factory::ResourceKind::Conversation
                && request.permission == ironloom_policy::factory::Permission::Operate
                && self.hold.swap(false, std::sync::atomic::Ordering::SeqCst);
            let result = self.inner.check(request).await;
            if pause {
                self.reached.notify_one();
                self.released.notified().await;
            }
            result
        })
    }
    fn write(
        &self,
        writes: Vec<Relationship>,
        deletes: Vec<Relationship>,
    ) -> BoxFuture<'_, Result<(), ironloom_policy::live::AuthorizationError>> {
        self.inner.write(writes, deletes)
    }
    fn bootstrap(
        &self,
        operator: OperatorId,
    ) -> BoxFuture<'_, Result<(), ironloom_policy::live::AuthorizationError>> {
        self.inner.bootstrap(operator)
    }
}
fn budget_command(
    command: &str,
    project: &ProjectId,
    conversation: &ConversationId,
    snapshot_revision: u64,
    budget_revision: u64,
    limit: Option<u64>,
) -> Command {
    serde_json::from_value(json!({"command_id":command,"project_id":project,"expected_revision":snapshot_revision.to_string(),"action":{"type":"budget","data":{"conversation_id":conversation,"budget":{"revision":budget_revision.to_string(),"limit_micros":limit.map(|value|value.to_string()),"currency":"USD","incurred_micros":"0","reserved_micros":"0","uncertain_usage":false}}}})).unwrap()
}
#[tokio::test]
#[ignore = "requires fresh IRONLOOM_COMMANDS_TEST_DATABASE_URL and PostgreSQL-backed IRONLOOM_TEST_OPENFGA_URL"]
async fn budget_commands_persist_replay_scope_and_accounting_without_model_execution() {
    let store = Store::connect(&std::env::var("IRONLOOM_COMMANDS_TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let installation = id(&format!("commands-{}", uuid::Uuid::new_v4()));
    store
        .initialize(&installation, b"commands-fixture-token")
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
                json!({"username":"commands-owner","password":"fixture-password-only"}),
            )
            .unwrap(),
            None,
            Some("commands-fixture-token"),
        )
        .await
        .unwrap();
    auth.bootstrap(
        alice.session.clone(),
        serde_json::from_value(json!({"token":"commands-fixture-token"})).unwrap(),
    )
    .await
    .unwrap();
    let bob = auth
        .register(
            serde_json::from_value(
                json!({"username":"commands-member","password":"fixture-password-only"}),
            )
            .unwrap(),
            Some(alice.session.clone()),
            None,
        )
        .await
        .unwrap();

    let root = tempfile::tempdir().unwrap();
    let node = NodeId::new("commands-node").unwrap();
    store
        .enroll_node(
            NodeEnrollment::new(NodeEnrollmentData {
                installation_id: InstallationId::new(installation.as_str()).unwrap(),
                node_id: node.clone(),
                host_id: HostId::new("commands-host").unwrap(),
                approved_by: alice.session.operator_id.clone(),
                public_key: id("fixture-public-key"),
                key_access_ref: CredentialId::new("fixture-key-reference").unwrap(),
                protocol_revision: Counter::new(1),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let boundary = Arc::new(Boundary {
        inner: authority.clone(),
        hold: std::sync::atomic::AtomicBool::new(false),
        reached: tokio::sync::Notify::new(),
        released: tokio::sync::Notify::new(),
    });
    let backend = FactoryBackend::new(
        store.clone(),
        auth.clone(),
        boundary.clone(),
        BackendInfrastructure {
            node_id: node.clone(),
            providers: BTreeSet::new(),
            engines: vec![],
            devices: vec![],
            sandbox_available: false,
            projects_root: root.path().into(),
        },
    )
    .await
    .unwrap();

    let project = ProjectId::new("commands-project").unwrap();
    let Operation::Write(mut batch) = store
        .begin(
            &bob.session.operator_id,
            &CommandId::new("project-create").unwrap(),
            &json!({"create":"project"}),
            &id("project"),
        )
        .await
        .unwrap()
    else {
        panic!("new project")
    };
    batch
        .create_project(&project, "Commands", Some(&id(node.as_str())))
        .await
        .unwrap();
    (*batch).commit(&json!({"created":true})).await.unwrap();
    authority
        .write(
            vec![
                Relationship::new(
                    format!("operator:{}", bob.session.operator_id.as_str()),
                    "owner",
                    format!("project:{}", project.as_str()),
                )
                .unwrap(),
            ],
            vec![],
        )
        .await
        .unwrap();
    let initial = backend
        .create_conversation(
            bob.session.clone(),
            CreateConversation::new(CreateConversationData {
                command_id: CommandId::new("empty").unwrap(),
                project_id: project.clone(),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let conversation = initial.session.conversation_id.clone();
    let first = budget_command("first-budget", &project, &conversation, 1, 1, Some(100));
    let receipt = backend
        .command(bob.session.clone(), first.clone())
        .await
        .unwrap();
    assert_eq!(receipt.disposition, CommandDisposition::Accepted);
    assert_eq!(receipt.cursor.as_ref().unwrap().sequence.get(), 1);
    let snapshot = backend
        .snapshot(bob.session.clone(), conversation.clone())
        .await
        .unwrap();
    assert_eq!(snapshot.revision.get(), 2);
    assert_eq!(snapshot.budget.as_ref().unwrap().revision.get(), 2);
    assert_eq!(
        snapshot
            .budget
            .as_ref()
            .unwrap()
            .limit_micros
            .unwrap()
            .get(),
        100
    );
    assert!(snapshot.active_assignment_id.is_none());
    assert!(snapshot.session.active_turn_id.is_none());
    let replay = backend
        .command(bob.session.clone(), first.clone())
        .await
        .unwrap();
    assert_eq!(replay.disposition, CommandDisposition::Replayed);
    assert_eq!(receipt.cursor, replay.cursor);
    assert_eq!(store.events(&conversation, 0, 100).await.unwrap().len(), 1);
    let mut changed = (*first).clone();
    changed.expected_revision = Counter::new(2);
    assert!(matches!(
        backend
            .command(bob.session.clone(), Command::new(changed).unwrap())
            .await,
        Err(ServiceError::Conflict)
    ));
    assert!(matches!(
        backend.command(alice.session.clone(), first.clone()).await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    let mut spoof = (*first).clone();
    spoof.project_id = ProjectId::new("another-project").unwrap();
    assert!(matches!(
        backend
            .command(bob.session.clone(), Command::new(spoof).unwrap())
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    let a = budget_command("budget-a", &project, &conversation, 2, 2, Some(200));
    let b = budget_command("budget-b", &project, &conversation, 2, 2, None);
    let (a, b) = tokio::join!(
        backend.command(bob.session.clone(), a),
        backend.command(bob.session.clone(), b)
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let snapshot = backend
        .snapshot(bob.session.clone(), conversation.clone())
        .await
        .unwrap();
    assert_eq!(snapshot.revision.get(), 3);
    assert_eq!(snapshot.budget.as_ref().unwrap().revision.get(), 3);
    assert_eq!(store.events(&conversation, 0, 100).await.unwrap().len(), 2);
    let command = budget_command(
        "forged-accounting",
        &project,
        &conversation,
        3,
        3,
        Some(300),
    );
    let mut wire = serde_json::to_value(&command).unwrap();
    wire["action"]["data"]["budget"]["incurred_micros"] = json!("100");
    assert!(matches!(
        backend
            .command(bob.session.clone(), serde_json::from_value(wire).unwrap())
            .await,
        Err(ServiceError::Validation(_))
    ));
    assert_eq!(store.events(&conversation, 0, 100).await.unwrap().len(), 2);
    // Real deployed-prefix HTTP uses the same command identity, cookie and CSRF boundary.
    let app = axum::Router::new().nest(
        "/factory",
        ironloom_runtime::http::factory::router(
            ironloom_runtime::http::factory::FactoryTransport::new(
                Arc::new(backend.clone()),
                ironloom_runtime::http::auth::AuthTransport::new(
                    auth.clone(),
                    "http://localhost/factory/",
                )
                .unwrap(),
            ),
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!(
        "http://{}/factory/api/v1/commands",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let client = reqwest::Client::new();
    let response = client
        .post(&endpoint)
        .header("cookie", format!("ironloom_session={}", bob.cookie_token()))
        .header("x-ironloom-csrf", bob.csrf_token())
        .json(&first)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let replay: CommandReceipt = response.json().await.unwrap();
    assert_eq!(replay.disposition, CommandDisposition::Replayed);
    assert_eq!(replay.cursor, receipt.cursor);
    assert_eq!(
        client
            .post(&endpoint)
            .header("cookie", format!("ironloom_session={}", bob.cookie_token()))
            .json(&first)
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    server.abort();
    let _ = server.await;
    // Revoke authority/session after initial checks, before the serialized mutation can commit.
    for revoke_session in [false, true] {
        boundary
            .hold
            .store(true, std::sync::atomic::Ordering::SeqCst);
        let service = backend.clone();
        let session = bob.session.clone();
        let command = budget_command(
            if revoke_session {
                "session-revoked-mid-command"
            } else {
                "grant-revoked-mid-command"
            },
            &project,
            &conversation,
            3,
            3,
            Some(400),
        );
        let task = tokio::spawn(async move { service.command(session, command).await });
        tokio::time::timeout(
            std::time::Duration::from_secs(5),
            boundary.reached.notified(),
        )
        .await
        .unwrap();
        let owner = Relationship::new(
            format!("operator:{}", bob.session.operator_id.as_str()),
            "owner",
            format!("project:{}", project.as_str()),
        )
        .unwrap();
        if revoke_session {
            auth.logout(bob.session.clone()).await.unwrap();
        } else {
            authority.write(vec![], vec![owner.clone()]).await.unwrap();
        }
        boundary.released.notify_one();
        let result = task.await.unwrap();
        if revoke_session {
            assert!(matches!(
                result,
                Err(ServiceError::Authentication(
                    AuthenticationError::Unauthenticated
                ))
            ));
        } else {
            assert!(matches!(
                result,
                Err(ServiceError::Authentication(AuthenticationError::Forbidden))
            ));
            authority.write(vec![owner], vec![]).await.unwrap();
        }
        assert_eq!(store.events(&conversation, 0, 100).await.unwrap().len(), 2);
    }
    store.close().await;
}

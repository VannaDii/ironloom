use ironloom_core::*;
use ironloom_policy::live::{Authority, AuthorizationError, OpenFga, Relationship};
use ironloom_runtime::{
    authentication::AuthenticationBackend,
    authorization::LiveAuthority,
    backend::{BackendInfrastructure, FactoryBackend},
};
use ironloom_service::factory::*;
use ironloom_storage::{
    factory::{FactoryStore, Lesson, LessonData, RecordScope, StoreFailure},
    postgres::{Operation, Store},
    secrets::SecretCipher,
};
use serde_json::json;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};
struct Projection {
    inner: Arc<LiveAuthority>,
    fail: std::sync::atomic::AtomicBool,
}
impl Authority for Projection {
    fn check(
        &self,
        request: ironloom_policy::factory::AuthorityCheck,
    ) -> BoxFuture<'_, ironloom_policy::factory::AuthorizationOutcome> {
        self.inner.check(request)
    }
    fn write(
        &self,
        writes: Vec<Relationship>,
        deletes: Vec<Relationship>,
    ) -> BoxFuture<'_, Result<(), AuthorizationError>> {
        Box::pin(async move {
            if self.fail.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(AuthorizationError::Unavailable);
            }
            self.inner.write(writes, deletes).await
        })
    }
    fn bootstrap(&self, operator: OperatorId) -> BoxFuture<'_, Result<(), AuthorizationError>> {
        self.inner.bootstrap(operator)
    }
}
fn id(value: &str) -> ActorId {
    ActorId::new(value).unwrap()
}
fn tuple(user: String, relation: &str, object: String) -> Relationship {
    Relationship::new(user, relation, object).unwrap()
}
fn mutate(
    command: &str,
    project: &ProjectId,
    revision: u64,
    operation: &str,
    scope: Option<&str>,
    content: Option<&str>,
) -> Command {
    serde_json::from_value(json!({"command_id":command,"project_id":project,"expected_revision":revision.to_string(),"action":{"type":"lesson","data":{"lesson_id":"shared-lesson","expected_revision":revision.to_string(),"operation":operation,"scope":scope,"content":content}}})).unwrap()
}
#[tokio::test]
#[ignore = "requires fresh IRONLOOM_LESSONS_TEST_DATABASE_URL and PostgreSQL-backed IRONLOOM_TEST_OPENFGA_URL"]
async fn shared_lesson_management_replays_without_private_source_access_or_source_events() {
    let store = Store::connect(&std::env::var("IRONLOOM_LESSONS_TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let installation = id(&format!("lessons-{}", uuid::Uuid::new_v4()));
    store
        .initialize(&installation, b"lesson-fixture-token")
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
                json!({"username":"lesson-owner","password":"fixture-password-only"}),
            )
            .unwrap(),
            None,
            Some("lesson-fixture-token"),
        )
        .await
        .unwrap();
    auth.bootstrap(
        alice.session.clone(),
        serde_json::from_value(json!({"token":"lesson-fixture-token"})).unwrap(),
    )
    .await
    .unwrap();
    let bob = auth
        .register(
            serde_json::from_value(
                json!({"username":"lesson-manager","password":"fixture-password-only"}),
            )
            .unwrap(),
            Some(alice.session.clone()),
            None,
        )
        .await
        .unwrap();
    let projection = Arc::new(Projection {
        inner: authority.clone(),
        fail: std::sync::atomic::AtomicBool::new(false),
    });
    let root = tempfile::tempdir().unwrap();
    let backend = Arc::new(
        FactoryBackend::new(
            store.clone(),
            auth.clone(),
            projection.clone(),
            BackendInfrastructure {
                node_id: NodeId::new("lesson-node").unwrap(),
                providers: BTreeSet::new(),
                engines: vec![],
                devices: vec![],
                sandbox_available: false,
                projects_root: root.path().into(),
            },
        )
        .await
        .unwrap(),
    );
    let origin = ProjectId::new("private-origin").unwrap();
    let context = ProjectId::new("manager-context").unwrap();
    let assignment = AssignmentId::new("private-assignment").unwrap();
    for (session, project) in [(&alice.session, &origin), (&bob.session, &context)] {
        let Operation::Write(mut batch) = store
            .begin(
                &session.operator_id,
                &CommandId::new(format!("create-{}", project.as_str())).unwrap(),
                &json!({"project":project}),
                &id(project.as_str()),
            )
            .await
            .unwrap()
        else {
            panic!("new project fixture");
        };
        batch
            .create_project(project, project.as_str(), None)
            .await
            .unwrap();
        (*batch).commit(&json!({"created":project})).await.unwrap();
        authority
            .write(
                vec![tuple(
                    format!("operator:{}", session.operator_id.as_str()),
                    "owner",
                    format!("project:{}", project.as_str()),
                )],
                vec![],
            )
            .await
            .unwrap();
    }
    let source = backend
        .create_conversation(
            alice.session.clone(),
            CreateConversation::new(CreateConversationData {
                command_id: CommandId::new("source-conversation").unwrap(),
                project_id: origin.clone(),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    assert!(matches!(
        backend
            .snapshot(bob.session.clone(), source.session.conversation_id.clone())
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    let initial = Lesson::new(LessonData {
        lesson_id: LessonId::new("shared-lesson").unwrap(),
        revision: Counter::new(1),
        origin_project: origin.clone(),
        origin_assignment: assignment,
        source: id(source.session.conversation_id.as_str()),
        scope: RecordScope::Project,
        content: "Apply the original lesson immediately in its project".into(),
    })
    .unwrap();
    store.save_lesson(initial.clone()).await.unwrap();
    let object = "lesson:shared-lesson".to_owned();
    authority
        .write(
            vec![
                tuple(
                    format!("project:{}", origin.as_str()),
                    "project",
                    object.clone(),
                ),
                tuple(
                    format!("operator:{}", alice.session.operator_id.as_str()),
                    "manager",
                    object.clone(),
                ),
                tuple(
                    format!("operator:{}", alice.session.operator_id.as_str()),
                    "sharer",
                    object.clone(),
                ),
                tuple(
                    format!("operator:{}", bob.session.operator_id.as_str()),
                    "manager",
                    object.clone(),
                ),
            ],
            vec![],
        )
        .await
        .unwrap();
    let query = |project: &ProjectId| {
        LessonQuery::new(LessonQueryData {
            project_id: project.clone(),
            assignment_id: None,
            scope: None,
            after: None,
            limit: Counter::new(10),
        })
        .unwrap()
    };
    assert_eq!(
        backend
            .lessons(alice.session.clone(), query(&origin))
            .await
            .unwrap()
            .lessons
            .len(),
        1
    );
    assert!(
        backend
            .lessons(bob.session.clone(), query(&context))
            .await
            .unwrap()
            .lessons
            .is_empty()
    );
    let promotion = mutate(
        "promote-lesson",
        &origin,
        1,
        "set_scope",
        Some("installation"),
        None,
    );
    projection
        .fail
        .store(true, std::sync::atomic::Ordering::SeqCst);
    assert!(matches!(
        backend
            .lesson_command(alice.session.clone(), promotion.clone())
            .await,
        Err(ServiceError::Unavailable)
    ));
    assert!(!store.grant_intents(None).await.unwrap().is_empty());
    projection
        .fail
        .store(false, std::sync::atomic::Ordering::SeqCst);
    let reopened = Store::connect(&std::env::var("IRONLOOM_LESSONS_TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let restarted = FactoryBackend::new(
        reopened.clone(),
        auth.clone(),
        authority.clone(),
        BackendInfrastructure {
            node_id: NodeId::new("lesson-node").unwrap(),
            providers: BTreeSet::new(),
            engines: vec![],
            devices: vec![],
            sandbox_available: false,
            projects_root: root.path().into(),
        },
    )
    .await
    .unwrap();
    assert!(restarted.recover_grants().await.unwrap() > 0);
    assert!(store.grant_intents(None).await.unwrap().is_empty());
    let receipt = backend
        .lesson_command(alice.session.clone(), promotion.clone())
        .await
        .unwrap();
    assert!(receipt.cursor.is_none());
    assert_eq!(
        backend
            .lessons(bob.session.clone(), query(&context))
            .await
            .unwrap()
            .lessons[0]
            .revision
            .get(),
        2
    );
    // Manage grants allow editing existing shared content without a source-project grant or
    // another share decision. Setup incompleteness does not delay local lesson retrieval.
    let edit = mutate(
        "edit-shared-content",
        &context,
        2,
        "edit",
        None,
        Some("Managed content without private source access"),
    );
    let receipt = backend
        .lesson_command(bob.session.clone(), edit.clone())
        .await
        .unwrap();
    assert!(receipt.cursor.is_none());
    assert_eq!(
        backend
            .lessons(alice.session.clone(), query(&origin))
            .await
            .unwrap()
            .lessons[0]
            .content,
        "Managed content without private source access"
    );
    assert_eq!(
        backend
            .lesson_command(bob.session.clone(), edit.clone())
            .await
            .unwrap()
            .disposition,
        CommandDisposition::Replayed
    );
    assert!(matches!(
        backend
            .lesson_command(
                bob.session.clone(),
                mutate("changed-payload", &context, 2, "edit", None, Some("Stale"))
            )
            .await,
        Err(ServiceError::Conflict)
    ));
    let restrict = mutate(
        "restrict-shared-content",
        &context,
        3,
        "set_scope",
        Some("project"),
        None,
    );
    backend
        .lesson_command(bob.session.clone(), restrict)
        .await
        .unwrap();
    assert!(
        backend
            .lessons(bob.session.clone(), query(&context))
            .await
            .unwrap()
            .lessons
            .is_empty()
    );
    // An old promotion replay must synchronize the current restriction, never republish it.
    backend
        .lesson_command(alice.session.clone(), promotion)
        .await
        .unwrap();
    assert!(
        backend
            .lessons(bob.session.clone(), query(&context))
            .await
            .unwrap()
            .lessons
            .is_empty()
    );
    let delete = mutate("delete-shared-content", &context, 4, "delete", None, None);
    backend
        .lesson_command(bob.session.clone(), delete.clone())
        .await
        .unwrap();
    assert_eq!(
        backend
            .lesson_command(bob.session.clone(), delete)
            .await
            .unwrap()
            .disposition,
        CommandDisposition::Replayed
    );
    backend
        .lesson_command(bob.session.clone(), edit)
        .await
        .unwrap();
    assert!(
        backend
            .lessons(alice.session.clone(), query(&origin))
            .await
            .unwrap()
            .lessons
            .is_empty()
    );
    assert_eq!(
        store.save_lesson(initial).await.unwrap_err(),
        StoreFailure::Conflict
    );
    assert!(
        store
            .events(&source.session.conversation_id, 0, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert!(matches!(
        backend
            .snapshot(bob.session.clone(), source.session.conversation_id.clone())
            .await,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    // The same deployed-path HTTP operation returns an event-free receipt under real cookie/CSRF.
    let app = axum::Router::new().nest(
        "/factory",
        ironloom_runtime::http::factory::router(
            ironloom_runtime::http::factory::FactoryTransport::new(
                backend,
                ironloom_runtime::http::auth::AuthTransport::new(auth, "http://localhost/factory/")
                    .unwrap(),
            ),
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/factory/api/v1", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let response = reqwest::Client::new()
        .post(format!("{endpoint}/commands"))
        .header("cookie", format!("ironloom_session={}", bob.cookie_token()))
        .header("x-ironloom-csrf", bob.csrf_token())
        .json(&mutate(
            "delete-shared-content",
            &context,
            4,
            "delete",
            None,
            None,
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let receipt: CommandReceipt = response.json().await.unwrap();
    assert!(receipt.cursor.is_none());
    assert_eq!(receipt.disposition, CommandDisposition::Replayed);
    server.abort();
    let _ = server.await;
    reopened.close().await;
    store.close().await;
}

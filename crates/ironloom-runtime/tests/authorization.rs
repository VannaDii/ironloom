use ironloom_core::{ActorId, OperatorId, ProjectId};
use ironloom_policy::{
    factory::{
        AuthorityCheck, AuthorityCheckData, AuthorizationOutcome, Permission, Resource,
        ResourceData, ResourceKind,
    },
    live::{Authority, OpenFga, Relationship},
};
use ironloom_runtime::{authentication::model_revision, authorization::LiveAuthority};
use ironloom_storage::postgres::Store;
fn relation(user: &str, relation: &str, object: &str) -> Relationship {
    Relationship::new(user, relation, object).unwrap()
}
fn check(
    operator: &OperatorId,
    kind: ResourceKind,
    id: &str,
    project: Option<&str>,
    permission: Permission,
) -> AuthorityCheck {
    AuthorityCheck::new(AuthorityCheckData {
        operator_id: operator.clone(),
        worker_id: None,
        assignment_id: None,
        resource: Resource::new(ResourceData {
            kind,
            id: ActorId::new(id).unwrap(),
            project_id: project.map(|id| ProjectId::new(id).unwrap()),
        })
        .unwrap(),
        permission,
        authorization_model: model_revision(),
    })
    .unwrap()
}
#[tokio::test]
#[ignore = "requires fresh IRONLOOM_AUTHORIZATION_TEST_DATABASE_URL and PostgreSQL-backed IRONLOOM_TEST_OPENFGA_URL"]
async fn coordinated_live_grants_keep_private_projects_and_credential_management_separate() {
    let url = std::env::var("IRONLOOM_AUTHORIZATION_TEST_DATABASE_URL").unwrap();
    let endpoint = std::env::var("IRONLOOM_TEST_OPENFGA_URL").unwrap();
    let store = Store::connect(&url).await.unwrap();
    store
        .initialize(
            &ActorId::new("live-authorization-fixture").unwrap(),
            b"fixture-token",
        )
        .await
        .unwrap();
    let alice = OperatorId::new("alice").unwrap();
    let bob = OperatorId::new("bob").unwrap();
    store
        .register_local(&alice, "alice", "unused-fixture-hash")
        .await
        .unwrap();
    store
        .register_local(&bob, "bob", "unused-fixture-hash")
        .await
        .unwrap();
    let client = OpenFga::new(&endpoint, None).unwrap();
    let (first, second) = tokio::join!(
        LiveAuthority::open(store.clone(), client.clone()),
        LiveAuthority::open(store.clone(), client)
    );
    let first = first.unwrap();
    let second = std::sync::Arc::new(second.unwrap());
    store
        .redeem_bootstrap(&alice, b"fixture-token")
        .await
        .unwrap();
    assert!(first.bootstrap(bob.clone()).await.is_err());
    // Force a second node to arrive while the first grant initialization is in flight.
    let initialization = store.bootstrap_initialization(&alice).await.unwrap();
    assert!(!initialization.initialized());
    let administrator = relation(
        "operator:alice",
        "administrator",
        "installation:live-authorization-fixture",
    );
    first
        .write(vec![administrator.clone()], vec![])
        .await
        .unwrap();
    let later = second.clone();
    let later_operator = alice.clone();
    let mut delayed = tokio::spawn(async move { later.bootstrap(later_operator).await });
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), &mut delayed)
            .await
            .is_err(),
        "second node must wait for storage-owned completion recheck"
    );
    initialization.complete().await.unwrap();
    // Deliberate revocation after completion must survive the already-started retry.
    first
        .write(vec![], vec![administrator.clone()])
        .await
        .unwrap();
    delayed.await.unwrap().unwrap();
    assert_eq!(
        second
            .check(check(
                &alice,
                ResourceKind::Installation,
                "live-authorization-fixture",
                None,
                Permission::Manage
            ))
            .await,
        AuthorizationOutcome::Denied
    );
    // Normal authorized fixture grant permits the independent resource tests below.
    first.write(vec![administrator], vec![]).await.unwrap();
    first.bootstrap(alice.clone()).await.unwrap();
    assert_eq!(
        second
            .check(check(
                &alice,
                ResourceKind::Installation,
                "live-authorization-fixture",
                None,
                Permission::Manage
            ))
            .await,
        AuthorizationOutcome::Allowed
    );
    first
        .write(
            vec![
                relation(
                    "installation:live-authorization-fixture",
                    "installation",
                    "project:private",
                ),
                relation("operator:bob", "owner", "project:private"),
            ],
            vec![],
        )
        .await
        .unwrap();
    let view = check(
        &alice,
        ResourceKind::Project,
        "private",
        Some("private"),
        Permission::View,
    );
    assert_eq!(
        second.check(view.clone()).await,
        AuthorizationOutcome::Denied
    );
    assert_eq!(
        second
            .check(check(
                &alice,
                ResourceKind::Project,
                "private",
                Some("private"),
                Permission::SelfGrant
            ))
            .await,
        AuthorizationOutcome::Allowed
    );
    let self_grant = relation("operator:alice", "viewer", "project:private");
    first.write(vec![self_grant.clone()], vec![]).await.unwrap();
    assert_eq!(
        second.check(view.clone()).await,
        AuthorizationOutcome::Allowed
    );
    first
        .write(
            vec![
                relation("operator:alice", "owner", "credential:provider"),
                relation("operator:bob", "user", "credential:provider"),
            ],
            vec![],
        )
        .await
        .unwrap();
    assert_eq!(
        second
            .check(check(
                &bob,
                ResourceKind::Credential,
                "provider",
                None,
                Permission::UseCredential
            ))
            .await,
        AuthorizationOutcome::Allowed
    );
    assert_eq!(
        second
            .check(check(
                &bob,
                ResourceKind::Credential,
                "provider",
                None,
                Permission::ReplaceCredential
            ))
            .await,
        AuthorizationOutcome::Denied
    );
    first.write(vec![], vec![self_grant]).await.unwrap();
    assert_eq!(second.check(view).await, AuthorizationOutcome::Denied);
    let mut stale: AuthorityCheckData = serde_json::from_value(
        serde_json::to_value(check(
            &alice,
            ResourceKind::Installation,
            "live-authorization-fixture",
            None,
            Permission::Manage,
        ))
        .unwrap(),
    )
    .unwrap();
    stale.authorization_model = ActorId::new("uncoordinated-model").unwrap();
    assert_eq!(
        second.check(AuthorityCheck::new(stale).unwrap()).await,
        AuthorizationOutcome::Unavailable
    );
    drop(first);
    drop(second);
    let reopened = LiveAuthority::open(store.clone(), OpenFga::new(&endpoint, None).unwrap())
        .await
        .unwrap();
    assert_eq!(
        reopened
            .check(check(
                &alice,
                ResourceKind::Installation,
                "live-authorization-fixture",
                None,
                Permission::Manage
            ))
            .await,
        AuthorizationOutcome::Allowed
    );
    // Human access to two projects never broadens an assignment-scoped worker delegation.
    reopened
        .write(
            vec![
                relation("operator:alice", "owner", "project:scope-a"),
                relation("operator:alice", "owner", "project:scope-b"),
                relation("project:scope-a", "project", "assignment:assignment-a"),
                relation("project:scope-b", "project", "assignment:assignment-b"),
                relation("worker:worker-a", "delegated", "assignment:assignment-a"),
                relation("project:scope-a", "project", "conversation:conversation-a"),
                relation("project:scope-b", "project", "conversation:conversation-b"),
                relation("assignment:assignment-a", "assignment", "file:file-a"),
                relation("assignment:assignment-b", "assignment", "file:file-b"),
            ],
            vec![],
        )
        .await
        .unwrap();
    let delegated = |request: AuthorityCheck| {
        let mut raw: AuthorityCheckData =
            serde_json::from_value(serde_json::to_value(request).unwrap()).unwrap();
        raw.worker_id = Some(ironloom_core::WorkerId::new("worker-a").unwrap());
        raw.assignment_id = Some(ironloom_core::AssignmentId::new("assignment-a").unwrap());
        AuthorityCheck::new(raw).unwrap()
    };
    assert_eq!(
        reopened
            .check(delegated(check(
                &alice,
                ResourceKind::Project,
                "scope-a",
                Some("scope-a"),
                Permission::Operate
            )))
            .await,
        AuthorizationOutcome::Allowed
    );
    for request in [
        check(
            &alice,
            ResourceKind::Project,
            "scope-b",
            Some("scope-b"),
            Permission::Operate,
        ),
        check(
            &alice,
            ResourceKind::Assignment,
            "assignment-b",
            Some("scope-b"),
            Permission::Operate,
        ),
        check(
            &alice,
            ResourceKind::Conversation,
            "conversation-b",
            Some("scope-b"),
            Permission::View,
        ),
        check(
            &alice,
            ResourceKind::Conversation,
            "conversation-b",
            Some("scope-a"),
            Permission::View,
        ),
        check(
            &alice,
            ResourceKind::File,
            "file-b",
            Some("scope-b"),
            Permission::View,
        ),
        check(
            &alice,
            ResourceKind::Installation,
            "live-authorization-fixture",
            None,
            Permission::Manage,
        ),
        check(
            &alice,
            ResourceKind::Credential,
            "provider",
            None,
            Permission::ReplaceCredential,
        ),
        check(
            &alice,
            ResourceKind::Assignment,
            "assignment-a",
            Some("scope-a"),
            Permission::Approve,
        ),
    ] {
        assert_eq!(
            reopened.check(delegated(request)).await,
            AuthorizationOutcome::Denied
        );
    }
    assert_eq!(
        reopened
            .check(delegated(check(
                &alice,
                ResourceKind::File,
                "file-a",
                Some("scope-a"),
                Permission::View
            )))
            .await,
        AuthorizationOutcome::Allowed
    );
    assert_eq!(
        reopened
            .check(delegated(check(
                &alice,
                ResourceKind::Credential,
                "provider",
                None,
                Permission::UseCredential
            )))
            .await,
        AuthorizationOutcome::Allowed
    );
    reopened
        .write(
            vec![],
            vec![relation("operator:alice", "owner", "project:scope-a")],
        )
        .await
        .unwrap();
    assert_eq!(
        reopened
            .check(delegated(check(
                &alice,
                ResourceKind::Credential,
                "provider",
                None,
                Permission::UseCredential
            )))
            .await,
        AuthorizationOutcome::Denied
    );
    // Readiness detects the required authorization dependency without inspecting team/model setup.
    assert!(reopened.ready().await.is_ok());
    let probe = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let unavailable_endpoint = format!("http://{}", probe.local_addr().unwrap());
    drop(probe);
    let unavailable = std::sync::Arc::new(
        LiveAuthority::open(
            store.clone(),
            OpenFga::new(unavailable_endpoint, None).unwrap(),
        )
        .await
        .unwrap(),
    );
    let router = ironloom_runtime::http::readiness_router(unavailable);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = format!("http://{}/readyz", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    assert_eq!(reqwest::get(&address).await.unwrap().status(), 503);
    assert!(
        store.installation().await.is_ok(),
        "PostgreSQL remains healthy during authorization loss"
    );
    server.abort();
    store.bootstrap_grants_ready(&alice).await.unwrap();
    reopened
        .write(
            vec![],
            vec![relation(
                "operator:alice",
                "administrator",
                "installation:live-authorization-fixture",
            )],
        )
        .await
        .unwrap();
    reopened.bootstrap(alice.clone()).await.unwrap();
    assert_eq!(
        reopened
            .check(check(
                &alice,
                ResourceKind::Installation,
                "live-authorization-fixture",
                None,
                Permission::Manage
            ))
            .await,
        AuthorizationOutcome::Denied
    );
    let binding = store
        .get("authorization", &ActorId::new("binding").unwrap())
        .await
        .unwrap()
        .unwrap();
    let operation = store
        .begin(
            &alice,
            &ironloom_core::CommandId::new("lose-binding-fixture").unwrap(),
            &serde_json::json!({}),
            &ActorId::new("authorization-binding-fixture").unwrap(),
        )
        .await
        .unwrap();
    let ironloom_storage::postgres::Operation::Write(mut deletion) = operation else {
        panic!("new fixture mutation");
    };
    deletion
        .delete(
            "authorization",
            &ActorId::new("binding").unwrap(),
            binding.revision,
        )
        .await
        .unwrap();
    (*deletion)
        .commit(&serde_json::json!({"deleted":true}))
        .await
        .unwrap();
    assert!(reopened.ready().await.is_err());
    assert!(
        LiveAuthority::open(store.clone(), OpenFga::new(&endpoint, None).unwrap())
            .await
            .is_err(),
        "missing established authorization binding must not be recreated"
    );
    store.close().await;
}

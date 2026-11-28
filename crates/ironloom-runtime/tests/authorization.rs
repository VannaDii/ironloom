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
    store
        .redeem_bootstrap(&alice, b"fixture-token")
        .await
        .unwrap();
    let client = OpenFga::new(&endpoint, None).unwrap();
    let (first, second) = tokio::join!(
        LiveAuthority::open(store.clone(), client.clone()),
        LiveAuthority::open(store.clone(), client)
    );
    let first = first.unwrap();
    let second = std::sync::Arc::new(second.unwrap());
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
    store.close().await;
}

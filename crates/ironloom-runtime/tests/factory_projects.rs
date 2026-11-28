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
#[tokio::test]
#[ignore = "requires fresh IRONLOOM_PROJECTS_TEST_DATABASE_URL and PostgreSQL-backed IRONLOOM_TEST_OPENFGA_URL"]
async fn authorized_catalog_paginates_past_private_projects_and_survives_missing_mounts() {
    let store = Store::connect(&std::env::var("IRONLOOM_PROJECTS_TEST_DATABASE_URL").unwrap())
        .await
        .unwrap();
    let installation = id(&format!("projects-{}", uuid::Uuid::new_v4()));
    store
        .initialize(&installation, b"projects-fixture-token")
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
                json!({"username":"projects-owner","password":"fixture-password-only"}),
            )
            .unwrap(),
            None,
            Some("projects-fixture-token"),
        )
        .await
        .unwrap();
    auth.bootstrap(
        alice.session.clone(),
        serde_json::from_value(json!({"token":"projects-fixture-token"})).unwrap(),
    )
    .await
    .unwrap();
    let bob = auth
        .register(
            serde_json::from_value(
                json!({"username":"projects-member","password":"fixture-password-only"}),
            )
            .unwrap(),
            Some(alice.session.clone()),
            None,
        )
        .await
        .unwrap();

    let root = tempfile::tempdir().unwrap();
    let node = NodeId::new("catalog-node").unwrap();
    store
        .enroll_node(
            NodeEnrollment::new(NodeEnrollmentData {
                installation_id: InstallationId::new(installation.as_str()).unwrap(),
                node_id: node.clone(),
                host_id: HostId::new("catalog-host").unwrap(),
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
            providers: BTreeSet::new(),
            engines: vec![],
            devices: vec![],
            sandbox_available: false,
            projects_root: root.path().into(),
        },
    )
    .await
    .unwrap();
    let visible = ProjectId::new("visible").unwrap();
    let other = ProjectId::new("other-visible").unwrap();
    // Over one storage page of newer private projects must not exhaust the authorized page early.
    for text in [visible.as_str(), other.as_str()]
        .into_iter()
        .map(str::to_owned)
        .chain((0..101).map(|index| format!("private-{index:03}")))
    {
        let project = ProjectId::new(&text).unwrap();
        let owner = if text.starts_with("private") {
            &alice.session.operator_id
        } else {
            &bob.session.operator_id
        };
        let Operation::Write(mut batch) = store
            .begin(
                owner,
                &CommandId::new(format!("create-{text}")).unwrap(),
                &json!({"project":project}),
                &id(&text),
            )
            .await
            .unwrap()
        else {
            panic!("new project")
        };
        batch
            .create_project(&project, &text, Some(&id(node.as_str())))
            .await
            .unwrap();
        (*batch).commit(&json!({"created":true})).await.unwrap();
        authority
            .write(
                vec![
                    Relationship::new(
                        format!("operator:{}", owner.as_str()),
                        "owner",
                        format!("project:{text}"),
                    )
                    .unwrap(),
                ],
                vec![],
            )
            .await
            .unwrap();
    }
    let query = |after, limit| {
        ProjectQuery::new(ProjectQueryData {
            after,
            limit: Counter::new(limit),
        })
        .unwrap()
    };
    let page = backend
        .projects(bob.session.clone(), query(None, 1))
        .await
        .unwrap();
    assert_eq!(page.projects.len(), 1);
    assert_eq!(page.projects[0].project_id, other);
    assert_eq!(page.projects[0].storage, ProjectStorageState::Unavailable);
    let cursor = page.next_after.clone().unwrap();
    let page = backend
        .projects(bob.session.clone(), query(Some(cursor), 1))
        .await
        .unwrap();
    assert_eq!(page.projects[0].project_id, visible);
    assert!(page.next_after.is_none());
    // Initial administrators do not silently see the other account's private projects.
    let page = backend
        .projects(alice.session.clone(), query(None, 100))
        .await
        .unwrap();
    assert_eq!(page.projects.len(), 100);
    assert!(
        page.projects
            .iter()
            .all(|project| project.project_id.as_str().starts_with("private"))
    );
    assert!(std::fs::read_dir(root.path()).unwrap().next().is_none());
    let repository = root.path().join(visible.as_str()).join("repository");
    std::fs::create_dir_all(&repository).unwrap();
    assert!(
        std::process::Command::new("/usr/bin/git")
            .args(["init", "--quiet", "--initial-branch=main"])
            .arg(&repository)
            .status()
            .unwrap()
            .success()
    );
    let page = backend
        .projects(bob.session.clone(), query(None, 10))
        .await
        .unwrap();
    assert_eq!(
        page.projects
            .iter()
            .find(|project| project.project_id == visible)
            .unwrap()
            .storage,
        ProjectStorageState::Available
    );
    std::fs::rename(
        repository.parent().unwrap(),
        root.path().join("detached-volume"),
    )
    .unwrap();
    let page = backend
        .projects(bob.session.clone(), query(None, 10))
        .await
        .unwrap();
    assert_eq!(page.projects.len(), 2);
    assert!(
        page.projects
            .iter()
            .all(|project| project.storage == ProjectStorageState::Unavailable)
    );
    assert!(
        !root.path().join(visible.as_str()).exists(),
        "missing storage must not be recreated"
    );
    authority
        .write(
            vec![],
            vec![
                Relationship::new(
                    format!("operator:{}", bob.session.operator_id.as_str()),
                    "owner",
                    format!("project:{}", other.as_str()),
                )
                .unwrap(),
            ],
        )
        .await
        .unwrap();
    let page = backend
        .projects(bob.session.clone(), query(None, 10))
        .await
        .unwrap();
    assert_eq!(page.projects.len(), 1);
    assert_eq!(page.projects[0].project_id, visible);
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
        "http://{}/factory/api/v1/projects",
        listener.local_addr().unwrap()
    );
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let client = reqwest::Client::new();
    let response = client
        .get(&endpoint)
        .query(&[("limit", "10")])
        .header("cookie", format!("ironloom_session={}", bob.cookie_token()))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let page: ProjectPage = response.json().await.unwrap();
    assert_eq!(page.projects.len(), 1);
    assert_eq!(page.projects[0].project_id, visible);
    assert_eq!(
        client
            .get(&endpoint)
            .query(&[("limit", "0")])
            .header("cookie", format!("ironloom_session={}", bob.cookie_token()))
            .send()
            .await
            .unwrap()
            .status(),
        400
    );
    assert_eq!(
        client
            .get(&endpoint)
            .query(&[("limit", "10")])
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    server.abort();
    let _ = server.await;
    auth.logout(bob.session.clone()).await.unwrap();
    assert!(matches!(
        backend.projects(bob.session.clone(), query(None, 10)).await,
        Err(ServiceError::Authentication(_))
    ));
    store.close().await;
}

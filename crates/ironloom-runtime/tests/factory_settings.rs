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
    let session = grant.session.clone();
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
        backend
            .instruction(session.clone(), selected)
            .await
            .unwrap(),
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
    let create = CreateConversation::new(CreateConversationData {
        command_id: CommandId::new("create-empty-conversation").unwrap(),
        project_id: project.clone(),
    })
    .unwrap();
    let initial = backend
        .create_conversation(session.clone(), create.clone())
        .await
        .unwrap();
    assert_eq!(initial.cursor.sequence.get(), 0);
    assert!(initial.session.active_turn_id.is_none());
    assert_eq!(
        backend
            .create_conversation(session.clone(), create)
            .await
            .unwrap(),
        initial
    );
    assert!(
        store
            .events(&initial.session.conversation_id, 0, 10)
            .await
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        backend
            .snapshot(session.clone(), initial.session.conversation_id.clone())
            .await
            .unwrap(),
        initial
    );
    let conversation = initial.session.conversation_id.clone();
    let query = |direction,
                 sequence,
                 before: Option<&str>,
                 after: Option<&str>,
                 turn: Option<&str>,
                 limit| {
        HistoryQuery::new(HistoryQueryData {
            as_of: ReplayCursor::new(ReplayCursorData {
                conversation_id: conversation.clone(),
                sequence: Counter::new(sequence),
            })
            .unwrap(),
            direction,
            before: before.map(|id| ItemId::new(id).unwrap()),
            after: after.map(|id| ItemId::new(id).unwrap()),
            turn_id: turn.map(|id| TurnId::new(id).unwrap()),
            limit: Counter::new(limit),
        })
        .unwrap()
    };
    assert!(
        backend
            .history(
                session.clone(),
                query(HistoryDirection::Backward, 0, None, None, None, 10)
            )
            .await
            .unwrap()
            .items
            .is_empty()
    );
    let Operation::Write(mut stream) = store
        .begin(
            &session.operator_id,
            &CommandId::new("scripted-history-events").unwrap(),
            &json!({"fixture":"history"}),
            &id(conversation.as_str()),
        )
        .await
        .unwrap()
    else {
        panic!("new stream fixture");
    };
    for (item, turn, text) in [
        ("z-first", "turn-one", "Original output"),
        ("a-second", "turn-one", "Second output"),
        ("m-third", "turn-two", "Another turn"),
        ("z-first", "turn-one", "Updated output"),
    ] {
        let sequence = stream.next_sequence(&conversation).await.unwrap();
        let history:HistoryItem=serde_json::from_value(json!({"conversation_id":conversation,"turn_id":turn,"item_id":item,"message":{"role":"assistant","text":text,"tool_calls":[],"tool_result":null}})).unwrap();
        let mut current = (*initial).clone();
        current.cursor = ReplayCursor::new(ReplayCursorData {
            conversation_id: conversation.clone(),
            sequence: Counter::new(sequence),
        })
        .unwrap();
        current.revision = Counter::new(2);
        let current = ConversationSnapshot::new(current).unwrap();
        let event = ServiceEvent::new(ServiceEventData {
            command_id: CommandId::new("scripted-history-events").unwrap(),
            cursor: current.cursor.clone(),
            project_id: project.clone(),
            event: None,
            snapshot: Some(current.clone()),
        })
        .unwrap();
        stream
            .append_event(
                &conversation,
                sequence,
                &serde_json::to_value(event).unwrap(),
            )
            .await
            .unwrap();
        stream
            .history_version(
                &conversation,
                &history.item_id,
                &history.turn_id,
                sequence,
                &serde_json::to_value(&history).unwrap(),
            )
            .await
            .unwrap();
        if sequence == 4 {
            stream
                .put(
                    "conversation",
                    &id(conversation.as_str()),
                    Some(&project),
                    None,
                    Some(1),
                    &serde_json::to_value(current).unwrap(),
                )
                .await
                .unwrap();
        }
    }
    (*stream)
        .commit(&json!({"fixture":"history"}))
        .await
        .unwrap();
    let older = backend
        .history(
            session.clone(),
            query(HistoryDirection::Backward, 3, None, None, None, 2),
        )
        .await
        .unwrap();
    assert_eq!(
        older
            .items
            .iter()
            .map(|item| item.item_id.as_str())
            .collect::<Vec<_>>(),
        ["a-second", "m-third"]
    );
    assert_eq!(older.next_before.as_ref().unwrap().as_str(), "a-second");
    let first = backend
        .history(
            session.clone(),
            query(
                HistoryDirection::Backward,
                3,
                Some("a-second"),
                None,
                None,
                2,
            ),
        )
        .await
        .unwrap();
    assert_eq!(
        first.items[0].message.text.as_deref(),
        Some("Original output")
    );
    assert!(first.next_before.is_none());
    let newer = backend
        .history(
            session.clone(),
            query(
                HistoryDirection::Forward,
                4,
                None,
                None,
                Some("turn-one"),
                1,
            ),
        )
        .await
        .unwrap();
    assert_eq!(newer.items[0].item_id.as_str(), "z-first");
    assert_eq!(
        newer.items[0].message.text.as_deref(),
        Some("Updated output")
    );
    assert_eq!(newer.next_after.as_ref().unwrap().as_str(), "z-first");
    let next = backend
        .history(
            session.clone(),
            query(
                HistoryDirection::Forward,
                4,
                None,
                Some("z-first"),
                Some("turn-one"),
                1,
            ),
        )
        .await
        .unwrap();
    assert_eq!(next.items[0].item_id.as_str(), "a-second");
    assert!(next.next_after.is_none());
    assert!(matches!(
        backend
            .history(
                session.clone(),
                query(
                    HistoryDirection::Forward,
                    4,
                    None,
                    Some("m-third"),
                    Some("turn-one"),
                    1
                )
            )
            .await,
        Err(ServiceError::Conflict)
    ));
    assert!(matches!(
        backend
            .history(
                session.clone(),
                query(HistoryDirection::Forward, 5, None, None, None, 1)
            )
            .await,
        Err(ServiceError::Conflict)
    ));
    let replay_from = ReplayCursor::new(ReplayCursorData {
        conversation_id: conversation.clone(),
        sequence: Counter::new(2),
    })
    .unwrap();
    let mut subscription = backend
        .subscribe(session.clone(), replay_from)
        .await
        .unwrap();
    for expected in [3, 4] {
        let event = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            subscription.events.recv(),
        )
        .await
        .unwrap()
        .unwrap()
        .unwrap();
        assert_eq!(event.cursor.sequence.get(), expected);
    }
    let owner = Relationship::new(
        format!("operator:{}", session.operator_id.as_str()),
        "owner",
        "project:settings-project",
    )
    .unwrap();
    authority.write(vec![], vec![owner.clone()]).await.unwrap();
    let revoked = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        subscription.events.recv(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(matches!(
        revoked,
        Err(ServiceError::Authentication(AuthenticationError::Forbidden))
    ));
    assert!(subscription.events.recv().await.is_none());
    authority.write(vec![owner], vec![]).await.unwrap();
    assert_eq!(
        backend
            .snapshot(session.clone(), conversation.clone())
            .await
            .unwrap()
            .cursor
            .sequence
            .get(),
        4
    );
    let later = backend
        .create_conversation(
            session.clone(),
            CreateConversation::new(CreateConversationData {
                command_id: CommandId::new("later-conversation").unwrap(),
                project_id: project.clone(),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let Operation::Write(mut touched) = store
        .begin(
            &session.operator_id,
            &CommandId::new("human-interaction-order").unwrap(),
            &json!({"fixture":"human"}),
            &id(conversation.as_str()),
        )
        .await
        .unwrap()
    else {
        panic!("new touch fixture");
    };
    let mut current = (*backend
        .snapshot(session.clone(), conversation.clone())
        .await
        .unwrap())
    .clone();
    current.session = SessionSummary::new(SessionSummaryData {
        last_human_interaction_ms: Counter::new(
            touched
                .conversation_interaction(&conversation)
                .await
                .unwrap(),
        ),
        ..(*current.session).clone()
    })
    .unwrap();
    current.revision = Counter::new(3);
    touched
        .put(
            "conversation",
            &id(conversation.as_str()),
            Some(&project),
            None,
            Some(2),
            &serde_json::to_value(ConversationSnapshot::new(current).unwrap()).unwrap(),
        )
        .await
        .unwrap();
    (*touched)
        .commit(&json!({"fixture":"human"}))
        .await
        .unwrap();
    for (order, expected) in [
        (
            SessionOrder::CreatedAt,
            later.session.conversation_id.clone(),
        ),
        (SessionOrder::HumanInteraction, conversation.clone()),
    ] {
        let query = SessionQuery::new(SessionQueryData {
            order: order.clone(),
            after: None,
            limit: Counter::new(1),
            archived: false,
            provider: None,
            source: None,
        })
        .unwrap();
        let first = backend.sessions(session.clone(), query).await.unwrap();
        assert_eq!(first[0].conversation_id, expected);
        let next = backend
            .sessions(
                session.clone(),
                SessionQuery::new(SessionQueryData {
                    order,
                    after: Some(expected),
                    limit: Counter::new(1),
                    archived: false,
                    provider: None,
                    source: None,
                })
                .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(next.len(), 1);
        assert_ne!(first[0].conversation_id, next[0].conversation_id);
    }
    let mut live = backend
        .subscribe(
            session.clone(),
            ReplayCursor::new(ReplayCursorData {
                conversation_id: conversation.clone(),
                sequence: Counter::new(4),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    let Operation::Write(mut burst) = store
        .begin(
            &session.operator_id,
            &CommandId::new("background-event-burst").unwrap(),
            &json!({"fixture":"bounded-live-feed"}),
            &id(conversation.as_str()),
        )
        .await
        .unwrap()
    else {
        panic!("new burst");
    };
    let mut latest = (*backend
        .snapshot(session.clone(), conversation.clone())
        .await
        .unwrap())
    .clone();
    latest.revision = Counter::new(4);
    for expected in 5..=75 {
        let sequence = burst.next_sequence(&conversation).await.unwrap();
        assert_eq!(sequence, expected);
        latest.cursor = ReplayCursor::new(ReplayCursorData {
            conversation_id: conversation.clone(),
            sequence: Counter::new(sequence),
        })
        .unwrap();
        let snapshot = ConversationSnapshot::new(latest.clone()).unwrap();
        let event = ServiceEvent::new(ServiceEventData {
            command_id: CommandId::new("background-event-burst").unwrap(),
            project_id: project.clone(),
            cursor: snapshot.cursor.clone(),
            event: None,
            snapshot: Some(snapshot),
        })
        .unwrap();
        burst
            .append_event(
                &conversation,
                sequence,
                &serde_json::to_value(event).unwrap(),
            )
            .await
            .unwrap();
    }
    burst
        .put(
            "conversation",
            &id(conversation.as_str()),
            Some(&project),
            None,
            Some(3),
            &serde_json::to_value(ConversationSnapshot::new(latest).unwrap()).unwrap(),
        )
        .await
        .unwrap();
    (*burst).commit(&json!({"fixture":"burst"})).await.unwrap();
    assert_eq!(
        tokio::time::timeout(std::time::Duration::from_secs(2), live.events.recv())
            .await
            .unwrap()
            .unwrap()
            .unwrap()
            .cursor
            .sequence
            .get(),
        5
    );
    drop(live);
    let mut slow = backend
        .subscribe(
            session.clone(),
            ReplayCursor::new(ReplayCursorData {
                conversation_id: conversation.clone(),
                sequence: Counter::new(0),
            })
            .unwrap(),
        )
        .await
        .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(2), async {
        while !slow.events.is_closed() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    let mut delivered = 0;
    while let Some(event) = slow.events.recv().await {
        match event {
            Ok(_) => delivered += 1,
            Err(error) => {
                assert_eq!(error, ServiceError::ResyncRequired);
                break;
            }
        }
    }
    assert!(delivered > 0 && delivered < 75);
    assert_eq!(
        backend
            .snapshot(session.clone(), conversation.clone())
            .await
            .unwrap()
            .cursor
            .sequence
            .get(),
        75
    );
    let transport =
        ironloom_runtime::http::auth::AuthTransport::new(auth, "http://localhost/factory/")
            .unwrap();
    let router = axum::Router::new().nest(
        "/factory",
        ironloom_runtime::http::factory::router(
            ironloom_runtime::http::factory::FactoryTransport::new(Arc::new(backend), transport),
        ),
    );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/factory/api/v1", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, router).await.unwrap();
    });
    let http = reqwest::Client::new();
    let cookie = format!("ironloom_session={}", grant.cookie_token());
    let response = http
        .get(format!("{endpoint}/configuration"))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let _: ConfigurationSnapshot = response.json().await.unwrap();
    let response = http
        .get(format!("{endpoint}/instructions?limit=20"))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let _: InstructionPage = response.json().await.unwrap();
    let watermark = encode_cursor(
        &ReplayCursor::new(ReplayCursorData {
            conversation_id: conversation.clone(),
            sequence: Counter::new(3),
        })
        .unwrap(),
    )
    .unwrap();
    let response = http
        .get(format!(
            "{endpoint}/sessions/{}/history?as_of={watermark}&direction=forward&turn_id=turn-one&limit=1",
            conversation.as_str()
        ))
        .header("cookie", &cookie)
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let history: HistoryPage = response.json().await.unwrap();
    assert_eq!(
        history.items[0].message.text.as_deref(),
        Some("Original output")
    );
    assert_eq!(
        http.post(format!("{endpoint}/sessions"))
            .header("cookie", &cookie)
            .json(&json!({"command_id":"http-create","project_id":project}))
            .send()
            .await
            .unwrap()
            .status(),
        403
    );
    let response = http
        .post(format!("{endpoint}/sessions"))
        .header("cookie", &cookie)
        .header("x-ironloom-csrf", grant.csrf_token())
        .json(&json!({"command_id":"http-create","project_id":project}))
        .send()
        .await
        .unwrap();
    assert_eq!(response.status(), 200);
    let empty: ConversationSnapshot = response.json().await.unwrap();
    assert_eq!(empty.cursor.sequence.get(), 0);
    assert_eq!(
        http.get(format!("{endpoint}/configuration"))
            .send()
            .await
            .unwrap()
            .status(),
        401
    );
    server.abort();
    let _ = server.await;
    store.close().await;
}

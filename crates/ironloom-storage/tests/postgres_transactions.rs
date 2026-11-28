use ironloom_core::{ActorId, CommandId, ConversationId, OperatorId, ProjectId};
use ironloom_storage::factory::{CommandClaim, FactoryStore, StoredCommand, StoredCommandData};
use ironloom_storage::postgres::{DatabaseError, Operation, Store};
use serde_json::json;
use sqlx::{ConnectOptions, postgres::PgPoolOptions};
use std::str::FromStr;

#[tokio::test]
#[ignore = "requires disposable PostgreSQL 18 via IRONLOOM_TEST_DATABASE_URL"]
async fn concurrent_bootstrap_idempotency_sessions_and_rollback_survive_reconnect() {
    let url = std::env::var("IRONLOOM_TEST_DATABASE_URL").expect("explicit fixture server");
    let options = sqlx::postgres::PgConnectOptions::from_str(&url)
        .unwrap()
        .disable_statement_logging();
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect_with(options.clone())
        .await
        .unwrap();
    let database = format!("ironloom_fixture_{}", uuid::Uuid::new_v4().simple());
    // The identifier contains only this fixed prefix and UUID hex, never request input.
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!("CREATE DATABASE {database}")))
        .execute(&admin)
        .await
        .unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect_with(options.database(&database))
        .await
        .unwrap();
    let store = Store::from_pool(pool.clone());
    let installation = ActorId::new("installation-fixture").unwrap();
    store
        .initialize(&installation, b"fixture-bootstrap-token")
        .await
        .unwrap();
    assert!(matches!(
        store.initialize(&installation, b"replacement-token").await,
        Err(DatabaseError::Conflict)
    ));
    let alice = OperatorId::new("alice").unwrap();
    let bob = OperatorId::new("bob").unwrap();
    store
        .register_local(&alice, "alice", "fixture-password-hash-a")
        .await
        .unwrap();
    store
        .register_local(&bob, "bob", "fixture-password-hash-b")
        .await
        .unwrap();
    let (a, b) = tokio::join!(
        store.redeem_bootstrap(&alice, b"fixture-bootstrap-token"),
        store.redeem_bootstrap(&bob, b"fixture-bootstrap-token")
    );
    assert_eq!(usize::from(a.is_ok()) + usize::from(b.is_ok()), 1);
    let (_, winner, ready) = store.installation().await.unwrap();
    let winner = winner.unwrap();
    assert!(!ready);
    store.bootstrap_grants_ready(&winner).await.unwrap();
    assert!(
        !store
            .setup_token_valid(b"fixture-bootstrap-token")
            .await
            .unwrap()
    );
    let session = ActorId::new("session-1").unwrap();
    store
        .save_session(
            &session,
            &alice,
            b"opaque-session",
            b"csrf-proof",
            "local",
            300,
        )
        .await
        .unwrap();
    assert!(
        store
            .session(b"opaque-session", None)
            .await
            .unwrap()
            .is_some()
    );
    assert!(
        store
            .session(b"opaque-session", Some(b"wrong-proof"))
            .await
            .unwrap()
            .is_none()
    );
    assert!(
        store
            .session(b"opaque-session", Some(b"csrf-proof"))
            .await
            .unwrap()
            .is_some()
    );
    store.revoke_session(&session, &alice).await.unwrap();
    assert!(
        store
            .session(b"opaque-session", None)
            .await
            .unwrap()
            .is_none()
    );
    // Installation setup has durable replay and CAS before any project/conversation exists.
    let setup_scope = ActorId::new("installation-fixture").unwrap();
    let setup_id = CommandId::new("initial-setup").unwrap();
    let setup_payload = json!({"lesson_handling":"project_only"});
    let Operation::Write(mut setup) = store
        .begin(&alice, &setup_id, &setup_payload, &setup_scope)
        .await
        .unwrap()
    else {
        panic!("new setup");
    };
    setup
        .put(
            "configuration",
            &setup_scope,
            None,
            None,
            None,
            &setup_payload,
        )
        .await
        .unwrap();
    (*setup).commit(&json!({"revision":"1"})).await.unwrap();
    assert!(matches!(
        store
            .begin(&alice, &setup_id, &setup_payload, &setup_scope)
            .await
            .unwrap(),
        Operation::Replay(_)
    ));
    let Operation::Write(mut stale) = store
        .begin(
            &alice,
            &CommandId::new("stale-setup").unwrap(),
            &json!({}),
            &setup_scope,
        )
        .await
        .unwrap()
    else {
        panic!("new setup");
    };
    assert!(matches!(
        stale
            .put("configuration", &setup_scope, None, None, None, &json!({}))
            .await,
        Err(DatabaseError::Conflict)
    ));
    drop(stale);
    let setup_record = store
        .get("configuration", &setup_scope)
        .await
        .unwrap()
        .unwrap();
    assert!(setup_record.project.is_none());
    assert_eq!(setup_record.revision, 1);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ironloom.projects")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ironloom.conversations")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    // Exercise the public command port, not just the concrete transaction helper.
    let stored = StoredCommand::new(StoredCommandData {
        operator_id: alice.clone(),
        command_id: CommandId::new("installation-port-command").unwrap(),
        conversation_id: None,
        project_id: None,
        payload_hash: ActorId::new("setup-fingerprint").unwrap(),
        receipt: json!({"revision":"1"}),
        first_event: None,
    })
    .unwrap();
    assert_eq!(
        store.commit_command(stored.clone()).await.unwrap(),
        CommandClaim::New
    );
    assert_eq!(
        store.commit_command(stored.clone()).await.unwrap(),
        CommandClaim::Existing
    );
    let mut changed: StoredCommandData =
        serde_json::from_value(serde_json::to_value(&stored).unwrap()).unwrap();
    changed.payload_hash = ActorId::new("changed-fingerprint").unwrap();
    assert_eq!(
        store
            .commit_command(StoredCommand::new(changed).unwrap())
            .await
            .unwrap(),
        CommandClaim::Conflict
    );
    let scope = ActorId::new("project-fixture").unwrap();
    let project = ProjectId::new(scope.as_str()).unwrap();
    let command = CommandId::new("create-project").unwrap();
    let payload = json!({"create":"project"});
    let Operation::Write(mut batch) = store
        .begin(&alice, &command, &payload, &scope)
        .await
        .unwrap()
    else {
        panic!("new command expected")
    };
    batch
        .create_project(&project, "Fixture project", None)
        .await
        .unwrap();
    batch
        .put(
            "configuration",
            &scope,
            Some(&project),
            None,
            None,
            &json!({"value":1}),
        )
        .await
        .unwrap();
    (*batch).commit(&json!({"created":true})).await.unwrap();
    let Operation::Replay(receipt) = store
        .begin(&alice, &command, &payload, &scope)
        .await
        .unwrap()
    else {
        panic!("replay expected")
    };
    assert_eq!(receipt, json!({"created":true}));
    assert!(matches!(
        store
            .begin(&alice, &command, &json!({"create":"different"}), &scope)
            .await,
        Err(DatabaseError::Conflict)
    ));
    let conversation = ConversationId::new("empty-conversation").unwrap();
    let creation_id = CommandId::new("create-empty-conversation").unwrap();
    let creation_payload = json!({"project_id":project,"create_conversation":true});
    let empty_snapshot = json!({"session":{"conversation_id":conversation,"active_turn_id":null,"project_id":project,"archived":false,"last_human_interaction_ms":"1"},"cursor":{"conversation_id":conversation,"sequence":"0"},"revision":"1","execution_state":null,"plan":null,"approval":null,"pending_questions":[],"budget":null,"active_assignment_id":null});
    let Operation::Write(mut creation) = store
        .begin(&alice, &creation_id, &creation_payload, &scope)
        .await
        .unwrap()
    else {
        panic!("new conversation");
    };
    creation
        .create_conversation(&conversation, &project)
        .await
        .unwrap();
    creation
        .put(
            "snapshot",
            &ActorId::new(conversation.as_str()).unwrap(),
            Some(&project),
            None,
            None,
            &empty_snapshot,
        )
        .await
        .unwrap();
    (*creation).commit(&empty_snapshot).await.unwrap();
    assert!(
        store
            .events(&conversation, 0, 100)
            .await
            .unwrap()
            .is_empty()
    );
    let Operation::Replay(replayed) = store
        .begin(&alice, &creation_id, &creation_payload, &scope)
        .await
        .unwrap()
    else {
        panic!("creation replay");
    };
    assert_eq!(replayed, empty_snapshot);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM ironloom.outbox")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let stored = StoredCommand::new(StoredCommandData {
        operator_id: alice.clone(),
        command_id: CommandId::new("empty-conversation-port-command").unwrap(),
        conversation_id: Some(conversation.clone()),
        project_id: Some(project.clone()),
        payload_hash: ActorId::new("empty-fingerprint").unwrap(),
        receipt: empty_snapshot,
        first_event: None,
    })
    .unwrap();
    assert_eq!(
        store.commit_command(stored).await.unwrap(),
        CommandClaim::New
    );
    assert!(
        store
            .events(&conversation, 0, 100)
            .await
            .unwrap()
            .is_empty()
    );
    let Operation::Write(mut first_event) = store
        .begin(
            &alice,
            &CommandId::new("first-real-event").unwrap(),
            &json!({}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("new event");
    };
    assert_eq!(first_event.next_sequence(&conversation).await.unwrap(), 1);
    drop(first_event);
    let abandoned = CommandId::new("abandoned-change").unwrap();
    let Operation::Write(mut batch) = store
        .begin(&alice, &abandoned, &json!({}), &scope)
        .await
        .unwrap()
    else {
        panic!("new command expected")
    };
    batch
        .put(
            "configuration",
            &scope,
            Some(&project),
            None,
            Some(1),
            &json!({"value":2}),
        )
        .await
        .unwrap();
    drop(batch);
    assert_eq!(
        store
            .get("configuration", &scope)
            .await
            .unwrap()
            .unwrap()
            .body,
        json!({"value":1})
    );
    let (_, same_winner, grants) = store.installation().await.unwrap();
    assert_eq!(same_winner, Some(winner));
    assert!(grants);
    store.close().await;
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!("DROP DATABASE {database}")))
        .execute(&admin)
        .await
        .unwrap();
    admin.close().await;
}

use ironloom_core::{ActorId, CommandId, OperatorId, ProjectId};
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
    let store = Store::from_pool(pool);
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

use sqlx::Executor;

#[tokio::test]
#[ignore = "requires a disposable PostgreSQL 18 database via IRONLOOM_TEST_DATABASE_URL"]
async fn bootstrap_commands_and_replay_preserve_durable_identity() {
    let url =
        std::env::var("IRONLOOM_TEST_DATABASE_URL").expect("explicit disposable test database");
    let pool = sqlx::PgPool::connect(&url).await.unwrap();
    let mut tx = pool.begin().await.unwrap();
    tx.execute(sqlx::raw_sql(include_str!(
        "../migrations/0001_factory_contracts.sql"
    )))
    .await
    .unwrap();
    tx.execute("INSERT INTO ironloom.operators VALUES ('human-a'), ('human-b')")
        .await
        .unwrap();
    tx.execute("INSERT INTO ironloom.installation (installation_id, bootstrap_token_hash) VALUES ('installation-1', decode('abcdef','hex'))").await.unwrap();
    let claim = "UPDATE ironloom.installation SET administrator_id = $1, bootstrap_token_hash = NULL, bootstrap_consumed_at = now() WHERE administrator_id IS NULL";
    assert_eq!(
        sqlx::query(claim)
            .bind("human-a")
            .execute(&mut *tx)
            .await
            .unwrap()
            .rows_affected(),
        1
    );
    assert_eq!(
        sqlx::query(claim)
            .bind("human-b")
            .execute(&mut *tx)
            .await
            .unwrap()
            .rows_affected(),
        0
    );
    tx.execute("SAVEPOINT expected_failure").await.unwrap();
    assert!(
        tx.execute("UPDATE ironloom.installation SET administrator_id = 'human-b'")
            .await
            .is_err()
    );
    tx.execute("ROLLBACK TO SAVEPOINT expected_failure")
        .await
        .unwrap();
    tx.execute("UPDATE ironloom.installation SET grants_initialized_at = now()")
        .await
        .unwrap();
    tx.execute("INSERT INTO ironloom.projects (project_id, owner_id, name) VALUES ('project-1', 'human-a', 'Original project')").await.unwrap();
    tx.execute("INSERT INTO ironloom.conversations (conversation_id, project_id) VALUES ('conversation-1', 'project-1')").await.unwrap();
    tx.execute("INSERT INTO ironloom.commands VALUES ('human-a', 'command-1', 'conversation-1', 'payload-hash', '{}')").await.unwrap();
    tx.execute("SAVEPOINT expected_failure").await.unwrap();
    assert!(tx.execute("INSERT INTO ironloom.commands VALUES ('human-a', 'command-1', 'conversation-1', 'changed-hash', '{}')").await.is_err());
    tx.execute("ROLLBACK TO SAVEPOINT expected_failure")
        .await
        .unwrap();
    // Same textual key from a different authenticated actor is a distinct command.
    tx.execute("INSERT INTO ironloom.commands VALUES ('human-b', 'command-1', 'conversation-1', 'payload-hash', '{}')").await.unwrap();
    tx.execute("INSERT INTO ironloom.events VALUES ('conversation-1', 18446744073709551615, 'human-a', 'command-1', '{}')").await.unwrap();
    tx.execute("INSERT INTO ironloom.outbox (conversation_id, sequence) VALUES ('conversation-1', 18446744073709551615)").await.unwrap();
    let cursor: String = sqlx::query_scalar("SELECT sequence::text FROM ironloom.events")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(cursor, "18446744073709551615");
    // Entire test rolls back, including DDL; no installation identity is left behind.
    tx.rollback().await.unwrap();
    pool.close().await;
}

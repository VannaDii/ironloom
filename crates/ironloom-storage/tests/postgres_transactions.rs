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
    for (command, wrong_project, wrong_assignment) in [
        (
            "wrong-project",
            Some(ProjectId::new("other-project").unwrap()),
            None,
        ),
        (
            "wrong-assignment",
            Some(project.clone()),
            Some(ActorId::new("other-assignment").unwrap()),
        ),
    ] {
        let Operation::Write(mut mutation) = store
            .begin(
                &alice,
                &CommandId::new(command).unwrap(),
                &json!({}),
                &scope,
            )
            .await
            .unwrap()
        else {
            panic!("new mismatch command");
        };
        assert!(matches!(
            mutation
                .put(
                    "configuration",
                    &scope,
                    wrong_project.as_ref(),
                    wrong_assignment.as_ref(),
                    Some(1),
                    &json!({"value":"must-not-change"})
                )
                .await,
            Err(DatabaseError::Conflict)
        ));
        drop(mutation);
        let unchanged = store.get("configuration", &scope).await.unwrap().unwrap();
        assert_eq!(unchanged.revision, 1);
        assert_eq!(unchanged.project.as_ref(), Some(&project));
        assert_eq!(unchanged.body, json!({"value":1}));
    }
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
    assert_eq!(same_winner, Some(winner.clone()));
    assert!(grants);
    // Claims are node-local and instance-fenced; an expired lease is not process termination.
    let node = ironloom_core::NodeId::new("dispatch-node").unwrap();
    store
        .enroll_node(
            ironloom_storage::factory::NodeEnrollment::new(
                ironloom_storage::factory::NodeEnrollmentData {
                    installation_id: ironloom_core::InstallationId::new(installation.as_str())
                        .unwrap(),
                    node_id: node.clone(),
                    host_id: ironloom_core::HostId::new("dispatch-host").unwrap(),
                    approved_by: winner.clone(),
                    public_key: ActorId::new("fixture-public-key").unwrap(),
                    key_access_ref: ironloom_core::CredentialId::new("fixture-key-reference")
                        .unwrap(),
                    protocol_revision: ironloom_core::Counter::new(1),
                },
            )
            .unwrap(),
        )
        .await
        .unwrap();
    let assignment = ironloom_core::AssignmentId::new("dispatch-assignment").unwrap();
    let lesson = ironloom_storage::factory::Lesson::new(ironloom_storage::factory::LessonData {
        lesson_id: ironloom_core::LessonId::new("lesson-local").unwrap(),
        revision: ironloom_core::Counter::new(1),
        origin_project: project.clone(),
        origin_assignment: assignment.clone(),
        source: ActorId::new("source-reference").unwrap(),
        scope: ironloom_storage::factory::RecordScope::Project,
        content: "Apply locally now".into(),
    })
    .unwrap();
    store.save_lesson(lesson.clone()).await.unwrap();
    let rows = store
        .lesson_rows(&project, None, None, None, 10)
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].1.assignment.as_ref(), Some(&assignment));
    assert_eq!(
        serde_json::from_value::<ironloom_storage::factory::Lesson>(rows[0].1.body.clone())
            .unwrap(),
        lesson
    );
    let mut restricted = (*lesson).clone();
    restricted.lesson_id = ironloom_core::LessonId::new("lesson-restricted").unwrap();
    restricted.scope = ironloom_storage::factory::RecordScope::Assignment;
    store
        .save_lesson(ironloom_storage::factory::Lesson::new(restricted).unwrap())
        .await
        .unwrap();
    assert_eq!(
        store
            .lesson_rows(&project, None, None, None, 10)
            .await
            .unwrap()
            .len(),
        2
    );
    assert_eq!(
        store
            .lesson_rows(
                &project,
                Some(&ironloom_core::AssignmentId::new("another-assignment").unwrap()),
                None,
                None,
                10
            )
            .await
            .unwrap()
            .len(),
        1
    );
    assert_eq!(
        store
            .lesson_rows(
                &project,
                None,
                Some(&ironloom_storage::factory::RecordScope::Project),
                None,
                10
            )
            .await
            .unwrap()
            .len(),
        1
    );
    let instance_a = ActorId::new("instance-a").unwrap();
    let instance_b = ActorId::new("instance-b").unwrap();
    let lease_duration = std::time::Duration::from_secs(30);
    let Operation::Write(mut queued) = store
        .begin(
            &alice,
            &CommandId::new("queue-dispatch").unwrap(),
            &json!({"fixture":"dispatch"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("fresh dispatch command");
    };
    queued
        .enqueue_dispatch(
            &assignment,
            &project,
            &node,
            &json!({"fixture":"scripted-role"}),
        )
        .await
        .unwrap();
    (*queued).commit(&json!({"queued":true})).await.unwrap();
    assert!(
        store
            .claim_next(
                &ironloom_core::NodeId::new("another-node").unwrap(),
                &instance_a,
                lease_duration
            )
            .await
            .unwrap()
            .is_none()
    );
    let (first, second) = tokio::join!(
        store.claim_next(&node, &instance_a, lease_duration),
        store.claim_next(&node, &instance_b, lease_duration)
    );
    let first = first.unwrap();
    let second = second.unwrap();
    assert_eq!(
        usize::from(first.is_some()) + usize::from(second.is_some()),
        1
    );
    let claim = first.or(second).unwrap();
    assert_eq!(claim.fence.get(), 1);
    let renewed = store.renew_claim(&claim, lease_duration).await.unwrap();
    assert!(renewed.expires_at_ms >= claim.expires_at_ms);
    let mut forged = claim.clone();
    forged.instance = ActorId::new("different-instance").unwrap();
    assert!(matches!(
        store.renew_claim(&forged, lease_duration).await,
        Err(DatabaseError::Conflict)
    ));
    use ironloom_storage::postgres::requests::InferenceState;
    let inference = ironloom_core::InferenceId::new("execution-request").unwrap();
    let request_worker = ironloom_core::WorkerId::new("execution-worker").unwrap();
    let corpus: serde_json::Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let mut request = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["name"] == "role-and-tool-roundtrip")
        .unwrap()["input"]
        .clone();
    request["assignment_id"] = json!(assignment);
    request["worker_id"] = json!(request_worker);
    request["inference_id"] = json!(inference);
    for (name, new) in [
        ("prepare-inference", true),
        ("replay-inference-identity", false),
    ] {
        let Operation::Write(mut batch) = store
            .begin(
                &alice,
                &CommandId::new(name).unwrap(),
                &json!({"fixture":name}),
                &scope,
            )
            .await
            .unwrap()
        else {
            panic!("new inference fixture")
        };
        assert_eq!(
            batch
                .prepare_inference(&claim, &request_worker, &inference, &request)
                .await
                .unwrap(),
            new
        );
        if new {
            batch
                .observe_inference(&claim, &inference, InferenceState::Running, None)
                .await
                .unwrap();
        }
        (*batch).commit(&json!({"prepared":new})).await.unwrap();
    }
    let Operation::Write(mut changed) = store
        .begin(
            &alice,
            &CommandId::new("changed-inference-payload").unwrap(),
            &json!({"fixture":"changed"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("new conflict fixture")
    };
    let mut changed_request = request.clone();
    changed_request["controls"]["max_output_tokens"] = json!("999");
    assert!(matches!(
        changed
            .prepare_inference(&claim, &request_worker, &inference, &changed_request)
            .await,
        Err(DatabaseError::Conflict)
    ));
    drop(changed);
    use ironloom_storage::postgres::paths::{PathAccess, PathArea, PathOperation};
    let worker = ironloom_core::WorkerId::new("path-worker").unwrap();
    for id in ["path-process-a", "path-process-b"] {
        sqlx::query("INSERT INTO ironloom.processes(process_id,assignment_id,node_id,fence,boot_identity,state,body) VALUES($1,$2,$3,1,'fixture-boot','running','{}')")
            .bind(id).bind(assignment.as_str()).bind(node.as_str()).execute(&pool).await.unwrap();
    }
    async fn try_paths(
        store: &Store,
        operator: &OperatorId,
        claim: &ironloom_storage::postgres::dispatch::DispatchLease,
        worker: &ironloom_core::WorkerId,
        id: &str,
        path: PathAccess,
    ) -> bool {
        let Operation::Write(mut batch) = store
            .begin(
                operator,
                &CommandId::new(id).unwrap(),
                &json!({"fixture":id}),
                &ActorId::new(id).unwrap(),
            )
            .await
            .unwrap()
        else {
            panic!("fresh path command")
        };
        match batch
            .acquire_paths(
                claim,
                worker,
                &PathOperation::Process(ActorId::new(id).unwrap()),
                &[path],
            )
            .await
        {
            Ok(()) => {
                (*batch).commit(&json!({"owned":true})).await.unwrap();
                true
            }
            Err(DatabaseError::Conflict) => false,
            Err(error) => panic!("unexpected path failure: {error}"),
        }
    }
    let (a, b) = tokio::join!(
        try_paths(
            &store,
            &alice,
            &claim,
            &worker,
            "path-process-a",
            PathAccess::new(PathArea::Workspace, "src".into(), true).unwrap()
        ),
        try_paths(
            &store,
            &alice,
            &claim,
            &worker,
            "path-process-b",
            PathAccess::new(PathArea::Workspace, "src/file".into(), false).unwrap()
        )
    );
    assert_ne!(
        a, b,
        "overlapping directory/file operations cannot both acquire ownership"
    );
    for id in ["path-process-a", "path-process-b"] {
        let Operation::Write(mut batch) = store
            .begin(
                &alice,
                &CommandId::new(format!("release-running-{id}")).unwrap(),
                &json!({"fixture":id}),
                &scope,
            )
            .await
            .unwrap()
        else {
            panic!("fresh release")
        };
        assert!(matches!(
            batch
                .release_paths(&claim, &PathOperation::Process(ActorId::new(id).unwrap()))
                .await,
            Err(DatabaseError::Conflict)
        ));
    }
    sqlx::query("UPDATE ironloom.dispatch SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE assignment_id=$1").bind(assignment.as_str()).execute(&pool).await.unwrap();
    assert!(matches!(
        store.renew_claim(&claim, lease_duration).await,
        Err(DatabaseError::Conflict)
    ));
    assert_eq!(
        sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM ironloom.file_owners WHERE assignment_id=$1"
        )
        .bind(assignment.as_str())
        .fetch_one(&pool)
        .await
        .unwrap(),
        1,
        "lease expiry never releases path ownership"
    );
    sqlx::query("UPDATE ironloom.processes SET state='stopped' WHERE process_id IN ('path-process-a','path-process-b')").execute(&pool).await.unwrap();
    for id in ["path-process-a", "path-process-b"] {
        let Operation::Write(mut batch) = store
            .begin(
                &alice,
                &CommandId::new(format!("release-stopped-{id}")).unwrap(),
                &json!({"fixture":id}),
                &scope,
            )
            .await
            .unwrap()
        else {
            panic!("fresh release")
        };
        batch
            .release_paths(&claim, &PathOperation::Process(ActorId::new(id).unwrap()))
            .await
            .unwrap();
        (*batch).commit(&json!({"released":true})).await.unwrap();
    }

    assert!(
        store
            .claim_next(&node, &instance_b, lease_duration)
            .await
            .unwrap()
            .is_none()
    );
    assert_eq!(store.uncertain_claims(&node, None).await.unwrap().len(), 1);
    sqlx::query("INSERT INTO ironloom.processes(process_id,assignment_id,node_id,fence,os_pid,boot_identity,state,body) VALUES('fixture-process',$1,$2,1,NULL,'fixture-boot','running','{}')").bind(assignment.as_str()).bind(node.as_str()).execute(&pool).await.unwrap();
    for process_stopped in [false, true] {
        if process_stopped {
            sqlx::query(
                "UPDATE ironloom.processes SET state='stopped' WHERE process_id='fixture-process'",
            )
            .execute(&pool)
            .await
            .unwrap();
            sqlx::query("INSERT INTO ironloom.external_mutations(mutation_id,assignment_id,fence,operation,state,body) VALUES('fixture-mutation',$1,1,'fixture-git','uncertain','{}')").bind(assignment.as_str()).execute(&pool).await.unwrap();
        }
        let Operation::Write(mut recovery) = store
            .begin(
                &alice,
                &CommandId::new(if process_stopped {
                    "blocked-mutation"
                } else {
                    "blocked-process"
                })
                .unwrap(),
                &json!({"fixture":"recovery"}),
                &scope,
            )
            .await
            .unwrap()
        else {
            panic!("fresh recovery command");
        };
        assert!(matches!(
            recovery.reconcile_claim(&claim, true).await,
            Err(DatabaseError::Conflict)
        ));
        drop(recovery);
    }
    sqlx::query("UPDATE ironloom.external_mutations SET state='applied' WHERE mutation_id='fixture-mutation'").execute(&pool).await.unwrap();
    let Operation::Write(mut observation) = store
        .begin(
            &alice,
            &CommandId::new("uncertain-inference").unwrap(),
            &json!({"fixture":"uncertain"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("new observation")
    };
    observation
        .observe_inference(
            &claim,
            &inference,
            InferenceState::Uncertain,
            Some(&json!({"transport":"lost"})),
        )
        .await
        .unwrap();
    (*observation)
        .commit(&json!({"uncertain":true}))
        .await
        .unwrap();
    let Operation::Write(mut recovery) = store
        .begin(
            &alice,
            &CommandId::new("blocked-inference-recovery").unwrap(),
            &json!({"fixture":"blocked"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("new recovery")
    };
    assert!(matches!(
        recovery.reconcile_claim(&claim, true).await,
        Err(DatabaseError::Conflict)
    ));
    drop(recovery);
    let Operation::Write(mut observation) = store
        .begin(
            &alice,
            &CommandId::new("confirmed-inference-stop").unwrap(),
            &json!({"fixture":"confirmed"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("new observation")
    };
    let mut wrong_owner = claim.clone();
    wrong_owner.instance = ActorId::new("not-the-owner").unwrap();
    assert!(matches!(
        observation
            .observe_inference(
                &wrong_owner,
                &inference,
                InferenceState::TerminationConfirmed,
                None
            )
            .await,
        Err(DatabaseError::Conflict)
    ));
    observation
        .observe_inference(
            &claim,
            &inference,
            InferenceState::TerminationConfirmed,
            Some(&json!({"owned_execution":"ended"})),
        )
        .await
        .unwrap();
    (*observation)
        .commit(&json!({"confirmed":true}))
        .await
        .unwrap();
    assert_eq!(
        store
            .inference_record(&inference)
            .await
            .unwrap()
            .unwrap()
            .state,
        InferenceState::TerminationConfirmed
    );

    let Operation::Write(mut recovery) = store
        .begin(
            &alice,
            &CommandId::new("reconciled-dispatch").unwrap(),
            &json!({"fixture":"reconciled"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("fresh recovery");
    };
    recovery.reconcile_claim(&claim, true).await.unwrap();
    (*recovery)
        .commit(&json!({"reconciled":true}))
        .await
        .unwrap();
    let replacement = store
        .claim_next(&node, &instance_b, lease_duration)
        .await
        .unwrap()
        .unwrap();
    assert_eq!(replacement.fence.get(), 2);
    let Operation::Write(mut repeated) = store
        .begin(
            &alice,
            &CommandId::new("completed-request-does-not-redispatch").unwrap(),
            &json!({"fixture":"no-redispatch"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("new identity check")
    };
    assert!(
        !repeated
            .prepare_inference(&replacement, &request_worker, &inference, &request)
            .await
            .unwrap()
    );
    assert!(matches!(
        repeated
            .observe_inference(&claim, &inference, InferenceState::Running, None)
            .await,
        Err(DatabaseError::Conflict)
    ));
    (*repeated)
        .commit(&json!({"dispatch":false}))
        .await
        .unwrap();

    assert!(matches!(
        store.uncertain_claim(&claim).await,
        Err(DatabaseError::Conflict)
    ));
    let Operation::Write(mut stale) = store
        .begin(
            &alice,
            &CommandId::new("stale-fenced-write").unwrap(),
            &json!({"fixture":"stale"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("fresh stale attempt");
    };
    assert!(matches!(
        stale.require_claim(&claim).await,
        Err(DatabaseError::Conflict)
    ));
    drop(stale);
    let Operation::Write(mut finished) = store
        .begin(
            &alice,
            &CommandId::new("finish-fenced-dispatch").unwrap(),
            &json!({"fixture":"finish"}),
            &scope,
        )
        .await
        .unwrap()
    else {
        panic!("fresh finish");
    };
    finished.finish_claim(&replacement).await.unwrap();
    (*finished).commit(&json!({"finished":true})).await.unwrap();
    assert!(
        store
            .claim_next(&node, &instance_a, lease_duration)
            .await
            .unwrap()
            .is_none()
    );
    store.close().await;
    sqlx::raw_sql(sqlx::AssertSqlSafe(format!("DROP DATABASE {database}")))
        .execute(&admin)
        .await
        .unwrap();
    admin.close().await;
}

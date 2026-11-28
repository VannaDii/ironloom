//! Authenticated shared-service HTTP transport; this module makes no dispatch decisions.
use super::auth::{AuthTransport, HttpError, body};
use crate::backend::FactoryBackend;
use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{HeaderMap, header},
    middleware,
    routing::get,
};
use ironloom_core::*;
use ironloom_service::factory::*;
use serde::Deserialize;
use std::sync::Arc;

const MAX_COMMAND_BODY: usize = 1024 * 1024;
/// Runtime-selected backend and shared opaque-session transport, common to all service routes.
#[derive(Clone)]
pub struct FactoryTransport {
    backend: Arc<FactoryBackend>,
    auth: AuthTransport,
}
impl FactoryTransport {
    /// Binds existing service state and authentication without creating an alternate identity store.
    pub fn new(backend: Arc<FactoryBackend>, auth: AuthTransport) -> Self {
        Self { backend, auth }
    }
}
/// Builds currently implemented routes relative to the configured deployment base.
pub fn router(state: FactoryTransport) -> Router {
    Router::new()
        .route("/api/v1/projects", get(projects))
        .route("/api/v1/configuration", get(configuration).post(configure))
        .route("/api/v1/instructions", get(instructions).post(instruction))
        .route(
            "/api/v1/assignments/{id}/instructions",
            get(instruction_copies),
        )
        .route("/api/v1/sessions", get(sessions).post(create_conversation))
        .route("/api/v1/sessions/{id}/snapshot", get(snapshot))
        .route("/api/v1/sessions/{id}/history", get(history))
        .route("/api/v1/events", get(events))
        .route(COMMANDS_PATH, axum::routing::post(command))
        .route("/api/v1/projects/{project}/lessons", get(lessons))
        .layer(DefaultBodyLimit::max(MAX_COMMAND_BODY))
        .layer(middleware::map_response(
            |mut response: axum::response::Response| async move {
                response.headers_mut().insert(
                    header::CACHE_CONTROL,
                    axum::http::HeaderValue::from_static("no-store"),
                );
                response
            },
        ))
        .with_state(state)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProjectParameters {
    after: Option<ActorId>,
    limit: Counter,
}
async fn projects(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Query(query): Query<ProjectParameters>,
) -> Result<Json<ProjectPage>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    let query = ProjectQuery::new(ProjectQueryData {
        after: query.after,
        limit: query.limit,
    })
    .map_err(|error| HttpError(ServiceError::Validation(error)))?;
    state
        .backend
        .projects(session, query)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn instruction_copies(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Path(assignment): Path<AssignmentId>,
) -> Result<Json<Vec<ironloom_process_graph::factory::InstructionCopy>>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .instruction_copies(session, assignment)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn command(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Json<CommandReceipt>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, true)
        .await
        .map_err(HttpError)?;
    let request: Command = body(&headers, &bytes)?;
    state
        .backend
        .command(session, request)
        .await
        .map(Json)
        .map_err(HttpError)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LessonParameters {
    assignment_id: Option<AssignmentId>,
    scope: Option<ironloom_storage::factory::RecordScope>,
    after: Option<LessonId>,
    limit: Counter,
}
async fn lessons(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Path(project): Path<ProjectId>,
    Query(query): Query<LessonParameters>,
) -> Result<Json<LessonPage>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    let query = LessonQuery::new(LessonQueryData {
        project_id: project,
        assignment_id: query.assignment_id,
        scope: query.scope,
        after: query.after,
        limit: query.limit,
    })
    .map_err(|error| HttpError(ServiceError::Validation(error)))?;
    state
        .backend
        .lessons(session, query)
        .await
        .map(Json)
        .map_err(HttpError)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EventsQuery {
    conversation_id: ConversationId,
}
async fn events(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Query(query): Query<EventsQuery>,
) -> Result<
    axum::response::Sse<
        impl futures_util::Stream<Item = Result<axum::response::sse::Event, std::convert::Infallible>>,
    >,
    HttpError,
> {
    use futures_util::StreamExt;
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    let header = headers
        .get("last-event-id")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            HttpError(ServiceError::Validation(
                ironloom_core::validation::ValidationErrors::field("cursor", "required"),
            ))
        })?;
    let after = decode_cursor(header).map_err(HttpError)?;
    if after.conversation_id != query.conversation_id {
        return Err(HttpError(ServiceError::Validation(
            ironloom_core::validation::ValidationErrors::field(
                "cursor.conversation_id",
                "conversation_mismatch",
            ),
        )));
    }
    let subscription = state
        .backend
        .subscribe(session, after)
        .await
        .map_err(HttpError)?;
    let stream = tokio_stream::wrappers::ReceiverStream::new(subscription.events).map(|result| {
        let event = result
            .and_then(|event| super::sse_event(&event))
            .unwrap_or_else(|error| {
                axum::response::sse::Event::default()
                    .event("ironloom.error")
                    .json_data(error)
                    .expect("redacted service error serializes")
            });
        Ok(event)
    });
    Ok(axum::response::Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::default()))
}
async fn sessions(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Query(query): Query<SessionQuery>,
) -> Result<Json<Vec<SessionSummary>>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .sessions(session, query)
        .await
        .map(Json)
        .map_err(HttpError)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ScopeQuery {
    project_id: Option<ProjectId>,
}
async fn configuration(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Query(query): Query<ScopeQuery>,
) -> Result<Json<ConfigurationSnapshot>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .configuration(session, query.project_id)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn configure(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Json<ConfigurationSnapshot>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, true)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .configure(session, body(&headers, &bytes)?)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn instructions(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Query(query): Query<InstructionQuery>,
) -> Result<Json<InstructionPage>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .instructions(session, query)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn instruction(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Json<InstructionTemplate>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, true)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .instruction(session, body(&headers, &bytes)?)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn create_conversation(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<Json<ConversationSnapshot>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, true)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .create_conversation(session, body(&headers, &bytes)?)
        .await
        .map(Json)
        .map_err(HttpError)
}
async fn snapshot(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Path(conversation): Path<ConversationId>,
) -> Result<Json<ConversationSnapshot>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    state
        .backend
        .snapshot(session, conversation)
        .await
        .map(Json)
        .map_err(HttpError)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct HistoryParameters {
    as_of: String,
    direction: HistoryDirection,
    before: Option<ItemId>,
    after: Option<ItemId>,
    turn_id: Option<TurnId>,
    limit: Counter,
}
async fn history(
    State(state): State<FactoryTransport>,
    headers: HeaderMap,
    Path(conversation): Path<ConversationId>,
    Query(query): Query<HistoryParameters>,
) -> Result<Json<HistoryPage>, HttpError> {
    let session = state
        .auth
        .authenticate(&headers, false)
        .await
        .map_err(HttpError)?;
    let as_of = decode_cursor(&query.as_of).map_err(HttpError)?;
    if as_of.conversation_id != conversation {
        return Err(HttpError(ServiceError::Validation(
            ironloom_core::validation::ValidationErrors::field(
                "as_of.conversation_id",
                "conversation_mismatch",
            ),
        )));
    }
    let query = HistoryQuery::new(HistoryQueryData {
        as_of,
        direction: query.direction,
        before: query.before,
        after: query.after,
        turn_id: query.turn_id,
        limit: query.limit,
    })
    .map_err(|error| HttpError(ServiceError::Validation(error)))?;
    state
        .backend
        .history(session, query)
        .await
        .map(Json)
        .map_err(HttpError)
}

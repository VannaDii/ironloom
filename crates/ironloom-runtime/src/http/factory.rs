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
        .route("/api/v1/configuration", get(configuration).post(configure))
        .route("/api/v1/instructions", get(instructions).post(instruction))
        .route("/api/v1/sessions", get(sessions).post(create_conversation))
        .route("/api/v1/sessions/{id}/snapshot", get(snapshot))
        .route("/api/v1/sessions/{id}/history", get(history))
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

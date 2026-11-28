//! HTTP transport, independent of shared service port definitions.
use ironloom_service::factory::{ServiceError, ServiceEvent, encode_cursor};

/// Creates one Axum SSE event from an already-persisted service event, without dispatching work.
pub fn sse_event(event: &ServiceEvent) -> Result<axum::response::sse::Event, ServiceError> {
    axum::response::sse::Event::default()
        .id(encode_cursor(&event.cursor)?)
        .event("ironloom.event")
        .json_data(event)
        .map_err(|_| ServiceError::Unavailable)
}

/// Opaque service-session/OIDC/bootstrap HTTP transport.
pub mod auth;

/// Readiness for the selected durable authorization dependencies, separate from execution setup.
pub fn readiness_router(
    authority: std::sync::Arc<crate::authorization::LiveAuthority>,
) -> axum::Router {
    axum::Router::new().route(
        "/readyz",
        axum::routing::get(move || {
            let authority = authority.clone();
            async move {
                if authority.ready().await.is_ok() {
                    axum::http::StatusCode::OK
                } else {
                    axum::http::StatusCode::SERVICE_UNAVAILABLE
                }
            }
        }),
    )
}

//! Shared software factory contracts.
use ironloom_core::validation::{ValidationErrors, positive};
use ironloom_core::*;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
/// Durable accounting precision.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum UsageBasis {
    /// Provider or engine counters.
    Reported,
    /// Deterministic estimate with an explicit basis.
    Estimated,
    /// Interrupted or unavailable counters; never treated as zero.
    Unknown,
}
/// Explicit cost basis; no silent billing fallback.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum BillingMode {
    /// API key billing.
    ApiKey,
    /// Account-backed OAuth usage; not API-key charges.
    Account,
    /// Configured local compute cost estimate.
    LocalEstimate,
}
ironloom_core::contract! {
/// Validated factory record.
Usage, UsageData {
    /// Idempotent request accounting key.
    inference_id: InferenceId,
    /// Absent when unknown.
    input_tokens: Option<Counter>,
    /// Absent when unknown.
    output_tokens: Option<Counter>,
    /// Reported cache usage where available.
    cached_tokens: Option<Counter>,
    /// Precision of measurement.
    basis: UsageBasis,
    /// Configured billing mode.
    billing: BillingMode,
    /// Optional cost in currency millionths.
    cost_micros: Option<Counter>,
    /// Explicit currency when cost is present.
    currency: Option<ActorId>,
    /// Rate/version or local estimate basis.
    calculation_basis: Option<ActorId>,
} |value| {
    let _ = value;
    if value.cost_micros.is_some()
        && (value.currency.is_none() || value.calculation_basis.is_none())
    {
        return Err(ValidationErrors::field(
            "cost_micros",
            "cost_basis_required",
        ));
    }
    if value.basis == UsageBasis::Unknown
        && (value.input_tokens.is_some()
            || value.output_tokens.is_some()
            || value.cost_micros.is_some())
    {
        return Err(ValidationErrors::field(
            "basis",
            "unknown_cannot_report_totals",
        ));
    }
    Ok(())
}
}
ironloom_core::contract! {
/// Validated factory record.
Budget, BudgetData {
    /// Editable without changing plan approval.
    revision: Counter,
    /// None disables budget, not usage accounting.
    limit_micros: Option<Counter>,
    /// Budget currency.
    currency: ActorId,
    /// Already accounted charges.
    incurred_micros: Counter,
    /// Concurrent in-flight exposure.
    reserved_micros: Counter,
    /// Unknown usage remains visible and constrains admission.
    uncertain_usage: bool,
} |value| {
    let _ = value;
    positive("revision", value.revision)
}
}

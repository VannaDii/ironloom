//! Pure metadata comparison. It neither chooses fallback engines nor admits GPU work.
use crate::factory::{
    BackendQualification, Compatibility, EngineCapabilities, EngineLoadOptions, EngineRequirements,
    ModelCard, ModelFit, ModelFitData,
};
use ironloom_core::Counter;

/// Compares exact advertised architecture/format/quantization and optional requirements.
/// Missing metadata remains unknown; a file extension alone can never establish compatibility.
pub fn engine_compatibility(
    card: &ModelCard,
    engine: &EngineCapabilities,
    options: &EngineLoadOptions,
    requirements: &EngineRequirements,
) -> (Compatibility, String) {
    let checks = [
        (
            "architecture",
            card.architecture.as_ref(),
            &engine.architectures,
        ),
        ("weight format", card.format.as_ref(), &engine.formats),
        (
            "quantization",
            card.quantization.as_ref(),
            &engine.quantizations,
        ),
    ];
    let mut unknown = Vec::new();
    for (label, actual, supported) in checks {
        match actual {
            Some(value) if !supported.contains(value) => {
                return (
                    Compatibility::Unsupported,
                    format!("Selected engine/version/backend does not support this {label}"),
                );
            }
            None => unknown.push(label),
            _ => {}
        }
    }
    use crate::factory::CapabilitySupport::*;
    for (required, support, label) in [
        (options.draft.is_some(), &engine.draft_models, "draft model"),
        (
            options.cache.is_some(),
            &engine.context_cache,
            "context cache",
        ),
        (
            options.concurrency.get() > 1,
            &engine.batching,
            "concurrent requests",
        ),
    ] {
        if required {
            match support {
                Unsupported => {
                    return (
                        Compatibility::Unsupported,
                        format!("Selected engine does not support {label}"),
                    );
                }
                Unknown => unknown.push(label),
                Supported => {}
            }
        }
    }
    if options
        .accelerators
        .iter()
        .any(|a| !engine.accelerators.contains(a))
    {
        return (
            Compatibility::Unsupported,
            "Requested accelerator is not supported by this engine/backend".into(),
        );
    }
    if engine
        .max_context_tokens
        .is_some_and(|maximum| options.context_tokens > maximum)
    {
        return (
            Compatibility::Unsupported,
            "Configured context exceeds this engine's advertised limit".into(),
        );
    }
    if !unknown.is_empty() {
        return (
            Compatibility::Unknown,
            format!(
                "Missing or unknown {} metadata; no inference probe was run",
                unknown.join(", ")
            ),
        );
    }
    // The exact driver checks tokenizer/template and architecture configuration without inference.
    (
        requirements.compatibility.clone(),
        requirements.reason.clone(),
    )
}
/// Combines explicit requirements with a centrally supplied fit result. It performs no reservation.
pub fn model_fit(
    requirements: &EngineRequirements,
    fits_after_idle_eviction: Option<bool>,
    qualification: BackendQualification,
) -> Result<ModelFit, ironloom_core::validation::ValidationErrors> {
    let components = [
        requirements.target_weight_bytes,
        requirements.draft_weight_bytes,
        requirements.cache_bytes,
        requirements.runtime_overhead_bytes,
        requirements.accelerator_bytes,
    ];
    let bytes = components
        .into_iter()
        .try_fold(0_u64, |total, value| total.checked_add(value?.get()));
    ModelFit::new(ModelFitData {
        compatibility: requirements.compatibility.clone(),
        estimated_bytes: bytes.map(Counter::new),
        fits_after_idle_eviction: if bytes.is_none() {
            None
        } else {
            fits_after_idle_eviction
        },
        qualification,
        reason: requirements.reason.clone(),
    })
}

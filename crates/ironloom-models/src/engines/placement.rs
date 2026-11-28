//! Exact service-resolved device handles. No discovery, reservation or hardware qualification.
use super::runtime::Artifact;
use crate::{devices::native::NativeAddress, factory::EngineLoadRequest, providers::AdapterError};
const UUID_GROUPS: [usize; 5] = [8, 4, 4, 4, 12];
const GPU_LAYERS: &str = "999";
pub(super) struct HelperPlacement {
    pub device: String,
    pub layers: &'static str,
    pub cuda_uuid: Option<String>,
}
pub(super) fn helper(
    request: &EngineLoadRequest,
    artifact: &Artifact,
) -> Result<HelperPlacement, AdapterError> {
    let backend = request
        .selection
        .engine
        .as_ref()
        .ok_or(AdapterError::Unsupported)?
        .backend
        .as_str();
    match (backend, artifact.native_device.as_ref()) {
        ("cpu", None) => Ok(HelperPlacement {
            device: "none".into(),
            layers: "0",
            cuda_uuid: None,
        }),
        ("cuda", Some(placement)) if cfg!(target_os = "linux") => {
            exact(request, placement)?;
            let NativeAddress::Cuda { uuid } = &placement.address else {
                return Err(AdapterError::Unsupported);
            };
            if !cuda_uuid(uuid) {
                return Err(AdapterError::Unsupported);
            }
            Ok(HelperPlacement {
                device: "CUDA0".into(),
                layers: GPU_LAYERS,
                cuda_uuid: Some(uuid.clone()),
            })
        }
        ("metal", Some(placement)) if cfg!(target_os = "macos") => {
            exact(request, placement)?;
            let NativeAddress::Metal {
                system_default: true,
                ..
            } = &placement.address
            else {
                return Err(AdapterError::Unsupported);
            };
            // This pinned helper exposes its system-default Metal device; another registry device
            // is unsupported, never silently substituted. SDK Metal can use an exact ordinal.
            Ok(HelperPlacement {
                device: "MTL0".into(),
                layers: GPU_LAYERS,
                cuda_uuid: None,
            })
        }
        _ => Err(AdapterError::Unsupported),
    }
}
pub(super) fn exact(
    request: &EngineLoadRequest,
    placement: &super::runtime::NativePlacement,
) -> Result<(), AdapterError> {
    if request.selection.devices.len() != 1
        || !placement.device.reconciled
        || request.selection.devices[0] != placement.device
    {
        return Err(AdapterError::Unsupported);
    }
    Ok(())
}
fn cuda_uuid(value: &str) -> bool {
    let Some(value) = value
        .strip_prefix("GPU-")
        .or_else(|| value.strip_prefix("MIG-"))
    else {
        return false;
    };
    let groups = value.split('-').collect::<Vec<_>>();
    groups.len() == UUID_GROUPS.len()
        && groups.iter().zip(UUID_GROUPS).all(|(group, length)| {
            group.len() == length && group.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cuda_visibility_requires_one_stable_uuid_and_never_ordinal_or_multiple_devices() {
        assert!(cuda_uuid("GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        assert!(cuda_uuid("MIG-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
        for bad in [
            "0",
            "GPU-short",
            "GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee,1",
            "GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeeZ",
        ] {
            assert!(!cuda_uuid(bad));
        }
    }
}

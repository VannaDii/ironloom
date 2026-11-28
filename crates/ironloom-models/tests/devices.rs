use ironloom_core::{BoxFuture, Counter, HostId};
use ironloom_models::{
    devices::{
        Devices,
        native::{NativeDevices, Probe, ProbeRunner},
    },
    providers::AdapterError,
};
use std::sync::Arc;
struct Script;
impl ProbeRunner for Script {
    fn read(&self, probe: Probe) -> BoxFuture<'_, Result<Vec<u8>, AdapterError>> {
        assert_eq!(probe, Probe::Nvidia);
        Box::pin(async { Ok(b"GPU-physical, 100, 20\nMIG-partition, N/A, N/A\n".to_vec()) })
    }
}
#[tokio::test]
async fn scripted_platform_views_preserve_host_identity_and_never_claim_reconciliation() {
    let devices = NativeDevices::new(
        HostId::new("physical-host").unwrap(),
        Probe::Nvidia,
        Arc::new(Script),
    );
    let views = devices.discover().await.unwrap();
    assert_eq!(views.len(), 2);
    assert!(views.iter().all(|v| !v.reconciled));
    assert_eq!(views[0].hardware_key.as_str(), "nvidia:GPU-physical");
    let reversed = devices
        .decode(
            b"MIG-partition, N/A, N/A\nGPU-physical, 100, 20\n",
            Counter::new(1),
        )
        .unwrap();
    assert_eq!(views[0].device_id, reversed[1].identity.device_id);
    assert!(reversed[0].resources.total_bytes.is_none());
    assert!(reversed[0].identity.parent_id.is_none());
    assert_eq!(
        reversed[1].resources.total_bytes.unwrap().get(),
        100 * 1024 * 1024
    );
    assert!(reversed[1].resources.external_used_bytes.is_none());
    let another = NativeDevices::new(
        HostId::new("other-host").unwrap(),
        Probe::Nvidia,
        Arc::new(Script),
    );
    assert_ne!(
        views[0].device_id,
        another
            .decode(b"GPU-physical, 100, 20", Counter::new(1))
            .unwrap()[0]
            .identity
            .device_id
    );
}
#[test]
fn malformed_or_duplicate_views_do_not_create_capacity() {
    let devices = NativeDevices::new(
        HostId::new("host").unwrap(),
        Probe::Nvidia,
        Arc::new(Script),
    );
    for raw in [
        "GPU-a, 1, 2",
        "GPU-a, 18446744073709551615, 0",
        "N/A, 100, 20",
        "GPU-a, 100, 20\nGPU-a, 100, 20",
    ] {
        assert!(devices.decode(raw.as_bytes(), Counter::new(1)).is_err());
    }
}
#[test]
fn metal_registry_strings_stay_exact_without_hardware_execution_or_memory_claims() {
    let devices = NativeDevices::new(HostId::new("host").unwrap(), Probe::Metal, Arc::new(Script));
    let views=devices.decode(br#"[{"registry_id":"18446744073709551615","name":"fixture","ordinal":"0","system_default":true,"recommended_bytes":"100"}]"#,Counter::new(1)).unwrap();
    assert_eq!(
        views[0].identity.hardware_key.as_str(),
        "metal-registry:18446744073709551615"
    );
    assert!(!views[0].identity.reconciled);
    assert!(views[0].resources.total_bytes.is_none() && views[0].resources.used_bytes.is_none());
    assert!(
        devices
            .decode(br#"[{"registry_id":42}]"#, Counter::new(1))
            .is_err()
    );
}

#[test]
fn inconsistent_metal_handles_cannot_select_a_different_registry_device() {
    let devices = NativeDevices::new(HostId::new("host").unwrap(), Probe::Metal, Arc::new(Script));
    for raw in [
        r#"[{"registry_id":"1","ordinal":"0","system_default":true},{"registry_id":"2","ordinal":"0","system_default":false}]"#,
        r#"[{"registry_id":"1","ordinal":"0","system_default":true},{"registry_id":"2","ordinal":"1","system_default":true}]"#,
    ] {
        assert!(devices.decode(raw.as_bytes(), Counter::new(1)).is_err());
    }
}

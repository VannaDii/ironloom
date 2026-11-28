#![cfg(target_os = "linux")]
use ironloom_core::{InferenceId, validation::decode};
use ironloom_models::{
    engines::{
        llama::{LlamaDriver, REVISION},
        runtime::{Artifact, Driver},
    },
    factory::*,
    providers::AdapterError,
};
use ironloom_workers::factory::StreamKind;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{os::unix::fs::PermissionsExt, time::Duration};
fn capabilities() -> EngineCapabilities {
    decode(&serde_json::to_vec(&json!({"engine":{"name":"llama.cpp","version":REVISION,"backend":"cpu","configuration_hash":"fixture"},"architectures":["llama"],"formats":["gguf"],"quantizations":["Q4_K_M"],"streaming":true,"tools":true,"draft_models":"unsupported","context_cache":"unsupported","batching":"unsupported","multi_gpu":"unsupported","accelerators":[]})).unwrap()).unwrap()
}
fn request() -> InferenceRequest {
    let corpus: Value =
        serde_json::from_str(include_str!("../../../fixtures/contracts/decode.json")).unwrap();
    let mut value = corpus["cases"]
        .as_array()
        .unwrap()
        .iter()
        .find(|case| case["name"] == "role-and-tool-roundtrip")
        .unwrap()["input"]
        .clone();
    value["selection"] = json!({"profile_id":"profile","provider":"fixture","billing":"local_estimate","model_id":"fixture","revision":"pinned","checkpoint_hash":"verified","engine":capabilities().engine,"devices":[{"device_id":"cpu","host_id":"host","hardware_key":"cpu","reconciled":true}]});
    value["engine_options"] = json!({"context_tokens":"512","concurrency":"1","accelerators":[]});
    value["messages"] = json!([{"role":"user","text":"hello","tool_calls":[]}]);
    value["tools"] = json!([]);
    decode(&serde_json::to_vec(&value).unwrap()).unwrap()
}
fn fixture() -> (tempfile::TempDir, LlamaDriver, EngineLoadRequest, Artifact) {
    let root = tempfile::tempdir().unwrap();
    let script = include_bytes!("fixtures/llama_helper.py");
    let executable = root.path().join("scripted-helper");
    std::fs::write(&executable, script).unwrap();
    std::fs::set_permissions(&executable, std::fs::Permissions::from_mode(0o700)).unwrap();
    std::fs::write(root.path().join("fixture.gguf"), gguf(1)).unwrap();
    let driver =
        LlamaDriver::new(executable, Sha256::digest(script).into(), capabilities()).unwrap();
    let inference = request();
    let load = EngineLoadRequest::new(EngineLoadRequestData {
        selection: inference.selection.clone(),
        options: inference.engine_options.clone().unwrap(),
    })
    .unwrap();
    let requirements = EngineRequirements::new(EngineRequirementsData {
        compatibility: Compatibility::Supported,
        reason: "scripted fixture only".into(),
        target_weight_bytes: None,
        draft_weight_bytes: None,
        cache_bytes: None,
        runtime_overhead_bytes: None,
        accelerator_bytes: None,
    })
    .unwrap();
    let artifact = Artifact {
        root: root.path().into(),
        weights: vec!["fixture.gguf".into()],
        tokenizer: None,
        template: None,
        requirements,
        tools: CapabilitySupport::Supported,
        reasoning_efforts: vec![],
    };
    (root, driver, load, artifact)
}
async fn setup() -> (
    tempfile::TempDir,
    std::sync::Arc<dyn ironloom_models::engines::runtime::Kernel>,
) {
    let (root, driver, load, artifact) = fixture();
    let kernel = driver.load(&load, artifact).await.unwrap();
    (root, kernel)
}
#[tokio::test]
async fn owned_helper_streams_scripted_output_and_stops_only_its_own_process() {
    let (_root, kernel) = setup().await;
    let mut output = kernel.stream(request()).await.unwrap();
    let mut events = Vec::new();
    while let Some(event) = output.recv().await {
        events.push(event);
    }
    assert!(
        events
            .iter()
            .any(|e| e.kind == StreamKind::TextDelta && e.text == "scripted")
    );
    assert_eq!(
        events
            .iter()
            .filter(|e| e.kind == StreamKind::Completed)
            .count(),
        1
    );
    let state = kernel.state().await.unwrap();
    assert!(state.alive);
    assert_eq!(state.active.unwrap().len(), 0);
    assert!(state.last_used_at_ms.is_some());
    let mut value = serde_json::to_value(request()).unwrap();
    value["inference_id"] = "second".into();
    value["messages"][0]["text"] = "wait".into();
    let request: InferenceRequest = decode(&serde_json::to_vec(&value).unwrap()).unwrap();
    let mut output = kernel.stream(request.clone()).await.unwrap();
    while output.recv().await.unwrap().kind != StreamKind::TextDelta {}
    assert_eq!(
        kernel.cancel(InferenceId::new("unrelated").unwrap()).await,
        Err(AdapterError::Unavailable)
    );
    tokio::time::timeout(
        Duration::from_secs(5),
        kernel.cancel(request.inference_id.clone()),
    )
    .await
    .unwrap()
    .unwrap();
    let events = tokio::time::timeout(Duration::from_secs(5), async {
        let mut events = Vec::new();
        while let Some(event) = output.recv().await {
            events.push(event);
        }
        events
    })
    .await
    .unwrap();
    assert!(
        events
            .iter()
            .any(|e| e.kind == StreamKind::TerminationConfirmed)
    );
    assert!(!events.iter().any(|e| e.kind == StreamKind::Completed));
    let state = kernel.state().await.unwrap();
    assert!(!state.alive);
    assert!(state.active.unwrap().is_empty());
    kernel.stop().await.unwrap();
}

#[tokio::test]
async fn cancelling_startup_reaps_owned_helper_and_preserves_installation_files() {
    let (root, driver, load, artifact) = fixture();
    std::fs::write(root.path().join("hold-startup"), b"scripted startup delay").unwrap();
    let task = tokio::spawn(async move { driver.load(&load, artifact).await });
    let pid = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            if let Ok(pid) = std::fs::read_to_string(root.path().join("helper.pid")) {
                break pid.parse::<u32>().unwrap();
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    task.abort();
    let _ = task.await;
    tokio::time::timeout(Duration::from_secs(3), async {
        while std::path::Path::new(&format!("/proc/{pid}")).exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert!(root.path().join("fixture.gguf").exists());
}

struct Authority {
    artifact: Artifact,
    allowed: std::sync::atomic::AtomicBool,
}
impl ironloom_models::engines::runtime::EngineAuthority for Authority {
    fn artifact<'a>(
        &'a self,
        _: &'a EngineLoadRequest,
    ) -> ironloom_core::BoxFuture<'a, Result<Artifact, AdapterError>> {
        Box::pin(async { Ok(self.artifact.clone()) })
    }
    fn load<'a>(
        &'a self,
        _: &'a EngineLoadRequest,
        _: &'a [ironloom_policy::factory::ResourceReservation],
    ) -> ironloom_core::BoxFuture<'a, Result<ironloom_core::ResidentModelId, AdapterError>> {
        Box::pin(async {
            if !self.allowed.load(std::sync::atomic::Ordering::SeqCst) {
                return Err(AdapterError::Unavailable);
            }
            Ok(ironloom_core::ResidentModelId::new("resident").unwrap())
        })
    }
    fn inference<'a>(
        &'a self,
        _: &'a InferenceRequest,
        _: &'a Residency,
    ) -> ironloom_core::BoxFuture<'a, Result<(), AdapterError>> {
        Box::pin(async {
            if self.allowed.load(std::sync::atomic::Ordering::SeqCst) {
                Ok(())
            } else {
                Err(AdapterError::Unavailable)
            }
        })
    }
    fn unload<'a>(
        &'a self,
        _: &'a Residency,
    ) -> ironloom_core::BoxFuture<'a, Result<(), AdapterError>> {
        Box::pin(async { Ok(()) })
    }
    fn resources(
        &self,
        _: EngineIdentity,
    ) -> ironloom_core::BoxFuture<'_, Result<Vec<DeviceResourceObservation>, AdapterError>> {
        Box::pin(async { Ok(vec![]) })
    }
}
fn reservation() -> ironloom_policy::factory::ResourceReservation {
    decode(br#"{"reservation_id":"reservation","authority_id":"authority","node_id":"node","device_id":"cpu","fence":"1","bytes":"1024","concurrency":"1","expires_at_ms":"100000"}"#).unwrap()
}
#[tokio::test]
async fn admitted_lifecycle_survives_caller_loss_reuses_residency_and_never_refreshes_lru_on_poll()
{
    use ironloom_models::{
        engines::{Engine, runtime::LocalEngine},
        providers::Provider,
    };
    use std::sync::{Arc, atomic::Ordering};
    let (root, driver, load, artifact) = fixture();
    let authority = Arc::new(Authority {
        artifact,
        allowed: std::sync::atomic::AtomicBool::new(false),
    });
    let engine = Arc::new(LocalEngine::new(Arc::new(driver), authority.clone()));
    assert!(
        engine
            .load(load.clone(), vec![reservation()])
            .await
            .is_err()
    );
    assert!(!root.path().join("helper.pid").exists());
    authority.allowed.store(true, Ordering::SeqCst);
    std::fs::write(root.path().join("hold-startup"), b"hold").unwrap();
    let instance = engine.clone();
    let target = load.clone();
    let task = tokio::spawn(async move { instance.load(target, vec![reservation()]).await });
    tokio::time::timeout(Duration::from_secs(3), async {
        while !root.path().join("helper.pid").exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    task.abort();
    let _ = task.await;
    std::fs::remove_file(root.path().join("hold-startup")).unwrap();
    let state = tokio::time::timeout(Duration::from_secs(3), engine.status())
        .await
        .unwrap()
        .unwrap();
    assert_eq!(state.state, EngineState::Ready);
    let resident = state.residents.as_ref().unwrap()[0].clone();
    let before = resident.last_used_at_ms;
    let reused = engine.load(load, vec![reservation()]).await.unwrap();
    assert_eq!(reused.resident_id, resident.resident_id);
    assert_eq!(
        engine
            .observe(resident.resident_id.clone())
            .await
            .unwrap()
            .last_used_at_ms,
        before
    );
    let mut output = engine.stream(request()).await.unwrap();
    while output.recv().await.is_some() {}
    let used = engine
        .observe(resident.resident_id.clone())
        .await
        .unwrap()
        .last_used_at_ms;
    assert!(used >= before);
    assert_eq!(
        engine
            .observe(resident.resident_id.clone())
            .await
            .unwrap()
            .last_used_at_ms,
        used
    );
    assert!(
        engine
            .restart(ironloom_core::Counter::new(2))
            .await
            .is_err()
    );
    engine.unload(resident.resident_id.clone()).await.unwrap();
    let state = engine
        .restart(ironloom_core::Counter::new(1))
        .await
        .unwrap();
    assert_eq!(state.state, EngineState::Stopped);
    assert_eq!(state.generation.get(), 2);
}

fn gguf(shards: u16) -> Vec<u8> {
    let mut bytes = b"GGUF".to_vec();
    bytes.extend(3u32.to_le_bytes());
    bytes.extend(0u64.to_le_bytes());
    bytes.extend(1u64.to_le_bytes());
    let key = b"split.count";
    bytes.extend((key.len() as u64).to_le_bytes());
    bytes.extend(key);
    bytes.extend(2u32.to_le_bytes());
    bytes.extend(shards.to_le_bytes());
    bytes
}
#[tokio::test]
async fn implicit_gguf_sibling_shards_are_rejected_before_any_helper_process() {
    let (root, driver, load, artifact) = fixture();
    std::fs::write(root.path().join("fixture.gguf"), gguf(2)).unwrap();
    assert!(matches!(
        driver.load(&load, artifact).await,
        Err(AdapterError::Unsupported)
    ));
    assert!(!root.path().join("helper.pid").exists());
    std::fs::write(root.path().join("fixture.gguf"), gguf(0)).unwrap();
    let (_, _, _, mut artifact) = fixture();
    artifact.root = root.path().into();
    assert!(driver.load(&load, artifact).await.is_err());
    assert!(!root.path().join("helper.pid").exists());
}

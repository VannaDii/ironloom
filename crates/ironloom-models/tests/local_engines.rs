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
        native_device: None,
        root: root.path().into(),
        weights: vec!["fixture.gguf".into()],
        tokenizer: None,
        template: None,
        requirements,
        tools: CapabilitySupport::Supported,
        reasoning_efforts: vec![],
    };
    let authority = std::sync::Arc::new(Authority {
        artifact: artifact.clone(),
        allowed: std::sync::atomic::AtomicBool::new(true),
    });
    let driver = LlamaDriver::new(
        executable,
        Sha256::digest(script).into(),
        capabilities(),
        authority,
    )
    .unwrap();
    (root, driver, load, artifact)
}
async fn setup() -> (
    tempfile::TempDir,
    std::sync::Arc<dyn ironloom_models::engines::runtime::Kernel>,
) {
    let (root, driver, load, artifact) = fixture();
    let kernel = driver
        .load(
            &load,
            artifact,
            ironloom_core::ResidentModelId::new("resident").unwrap(),
        )
        .await
        .unwrap();
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
    let task = tokio::spawn(async move {
        driver
            .load(
                &load,
                artifact,
                ironloom_core::ResidentModelId::new("resident").unwrap(),
            )
            .await
    });
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
    fn spawn_helper<'a>(
        &'a self,
        _: &'a EngineLoadRequest,
        resident: ironloom_core::ResidentModelId,
        launch: ironloom_models::engines::runtime::HelperLaunch,
    ) -> ironloom_core::BoxFuture<
        'a,
        Result<ironloom_models::engines::runtime::OwnedHelper, AdapterError>,
    > {
        Box::pin(async move {
            // Inert Linux service fixture. Production uses the runtime's approved native launcher;
            // this existing host utility installs the same kernel parent-death signal before exec.
            let mut command = tokio::process::Command::new("/usr/bin/setpriv");
            command
                .args(["--pdeathsig", "KILL", "--"])
                .arg(launch.command.as_std().get_program())
                .args(launch.command.as_std().get_args())
                .env_clear()
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true);
            command.current_dir(launch.command.as_std().get_current_dir().unwrap());
            for (key, value) in launch.command.as_std().get_envs() {
                if let Some(value) = value {
                    command.env(key, value);
                } else {
                    command.env_remove(key);
                }
            }
            let mut child = command.spawn().map_err(|_| AdapterError::Unavailable)?;
            let pid = child.id().ok_or(AdapterError::Unavailable)?;
            let process = ironloom_core::ActorId::new(uuid::Uuid::new_v4().to_string()).unwrap();
            let recorded = (|| {
                let stat = std::fs::read_to_string(format!("/proc/{pid}/stat"))?;
                let start = stat
                    .rsplit_once(") ")
                    .unwrap()
                    .1
                    .split_whitespace()
                    .nth(19)
                    .unwrap();
                let boot = std::fs::read_to_string("/proc/sys/kernel/random/boot_id")?;
                use std::{io::Write, os::unix::fs::OpenOptionsExt};
                let mut record = std::fs::OpenOptions::new()
                    .create(true)
                    .truncate(true)
                    .write(true)
                    .mode(0o600)
                    .open(self.artifact.root.join("owned-process.json"))?;
                record.write_all(serde_json::to_vec(&json!({"process":process,"pid":pid,"start":start,"boot":boot,"resident":resident,"endpoint":launch.endpoint.as_str(),"credential_file":launch.credential_file,"state":"running"})).unwrap().as_slice())?;
                record.sync_all()
            })();
            if recorded.is_err() {
                let _ = child.kill().await;
                let _ = child.wait().await;
                return Err(AdapterError::Unavailable);
            }
            Ok(ironloom_models::engines::runtime::OwnedHelper {
                child,
                process_id: process,
            })
        })
    }
    fn helper_stopped(
        &self,
        process: ironloom_core::ActorId,
    ) -> ironloom_core::BoxFuture<'_, Result<(), AdapterError>> {
        Box::pin(async move {
            let path = self.artifact.root.join("owned-process.json");
            let mut record: Value = serde_json::from_slice(
                &std::fs::read(&path).map_err(|_| AdapterError::Unavailable)?,
            )
            .map_err(|_| AdapterError::Unavailable)?;
            if record["process"] != process.as_str() {
                return Err(AdapterError::Unavailable);
            }
            record["state"] = "stopped".into();
            std::fs::write(path, serde_json::to_vec(&record).unwrap())
                .map_err(|_| AdapterError::Unavailable)
        })
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
        driver
            .load(
                &load,
                artifact,
                ironloom_core::ResidentModelId::new("resident").unwrap()
            )
            .await,
        Err(AdapterError::Unsupported)
    ));
    assert!(!root.path().join("helper.pid").exists());
    std::fs::write(root.path().join("fixture.gguf"), gguf(0)).unwrap();
    let (_, _, _, mut artifact) = fixture();
    artifact.root = root.path().into();
    assert!(
        driver
            .load(
                &load,
                artifact,
                ironloom_core::ResidentModelId::new("resident").unwrap()
            )
            .await
            .is_err()
    );
    assert!(!root.path().join("helper.pid").exists());
}

#[test]
fn fixture_parent_service() {
    let Ok(path) = std::env::var("IRONLOOM_FIXTURE_PARENT_ROOT") else {
        return;
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    runtime.block_on(async move {
        let (_unused, _, request, mut artifact) = fixture();
        artifact.root = path.clone().into();
        let authority = std::sync::Arc::new(Authority {
            artifact: artifact.clone(),
            allowed: std::sync::atomic::AtomicBool::new(true),
        });
        let script = include_bytes!("fixtures/llama_helper.py");
        let driver = LlamaDriver::new(
            std::path::Path::new(&path).join("scripted-helper"),
            Sha256::digest(script).into(),
            capabilities(),
            authority,
        )
        .unwrap();
        let _kernel = driver
            .load(
                &request,
                artifact,
                ironloom_core::ResidentModelId::new("resident").unwrap(),
            )
            .await
            .unwrap();
        std::fs::write(
            std::path::Path::new(&path).join("parent-ready"),
            b"registered",
        )
        .unwrap();
        std::future::pending::<()>().await;
    });
}

#[tokio::test]
async fn killed_service_leaves_durable_identity_and_parent_death_stops_only_its_helper() {
    let (root, _, _, _) = fixture();
    let mut unrelated = tokio::process::Command::new("/usr/bin/sleep")
        .arg("30")
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut parent = tokio::process::Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "fixture_parent_service", "--nocapture"])
        .env("IRONLOOM_FIXTURE_PARENT_ROOT", root.path())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    tokio::time::timeout(Duration::from_secs(10), async {
        while !root.path().join("parent-ready").exists() {
            assert!(parent.try_wait().unwrap().is_none());
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    let record: Value =
        serde_json::from_slice(&std::fs::read(root.path().join("owned-process.json")).unwrap())
            .unwrap();
    assert_eq!(record["resident"], "resident");
    assert_eq!(record["state"], "running");
    assert!(!record["boot"].as_str().unwrap().trim().is_empty());
    assert!(!record["start"].as_str().unwrap().is_empty());
    let pid = record["pid"].as_u64().unwrap();
    parent.kill().await.unwrap();
    parent.wait().await.unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let state = std::fs::read_to_string(format!("/proc/{pid}/stat"));
            if state.is_err() || state.unwrap().rsplit_once(") ").unwrap().1.starts_with('Z') {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    // A service crash does not run the stopped callback. Durable recovery must reconcile this
    // exact boot/start identity; it must not infer free reservations solely from parent death.
    let remaining: Value =
        serde_json::from_slice(&std::fs::read(root.path().join("owned-process.json")).unwrap())
            .unwrap();
    assert_eq!(remaining, record);
    assert!(unrelated.try_wait().unwrap().is_none());
    unrelated.kill().await.unwrap();
    unrelated.wait().await.unwrap();
    let owned_key = std::path::Path::new(record["credential_file"].as_str().unwrap());
    assert!(owned_key.exists());
    // Disposable restart recovery removes only the exact protected path recorded by this fixture.
    std::fs::remove_file(owned_key).unwrap();
    assert!(root.path().join("scripted-helper").exists());
}

#[tokio::test]
async fn failed_stop_persistence_keeps_ownership_uncertain_until_reconciled() {
    let (root, kernel) = setup().await;
    let path = root.path().join("owned-process.json");
    let record = std::fs::read(&path).unwrap();
    std::fs::remove_file(&path).unwrap();
    assert!(kernel.stop().await.is_err());
    assert!(kernel.state().await.is_err());
    std::fs::write(&path, record).unwrap();
    kernel.stop().await.unwrap();
    assert!(!kernel.state().await.unwrap().alive);
    let confirmed: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(confirmed["state"], "stopped");
}

#[tokio::test]
async fn explicit_cuda_placement_masks_exact_uuid_in_inert_helper_and_rejects_missing_binding() {
    use ironloom_models::{devices::native::NativeAddress, engines::runtime::NativePlacement};
    let (root, _, mut load, mut artifact) = fixture();
    let mut caps = capabilities();
    let mut value = serde_json::to_value(&caps).unwrap();
    value["engine"]["backend"] = "cuda".into();
    caps = decode(&serde_json::to_vec(&value).unwrap()).unwrap();
    let mut value = serde_json::to_value(&load).unwrap();
    value["selection"]["engine"] = serde_json::to_value(&caps.engine).unwrap();
    value["selection"]["devices"][0] = json!({"device_id":"canonical-gpu","host_id":"host","hardware_key":"physical-gpu","reconciled":true});
    load = decode(&serde_json::to_vec(&value).unwrap()).unwrap();
    let uuid = "GPU-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    std::fs::write(root.path().join("expected-cuda-uuid"), uuid).unwrap();
    let authority = std::sync::Arc::new(Authority {
        artifact: artifact.clone(),
        allowed: std::sync::atomic::AtomicBool::new(true),
    });
    let driver = LlamaDriver::new(
        root.path().join("scripted-helper"),
        Sha256::digest(include_bytes!("fixtures/llama_helper.py")).into(),
        caps,
        authority,
    )
    .unwrap();
    let resident = ironloom_core::ResidentModelId::new("resident").unwrap();
    assert!(matches!(
        driver.load(&load, artifact.clone(), resident.clone()).await,
        Err(AdapterError::Unsupported)
    ));
    assert!(!root.path().join("helper.pid").exists());
    artifact.native_device = Some(NativePlacement {
        device: request().selection.devices[0].clone(),
        address: NativeAddress::Cuda { uuid: uuid.into() },
    });
    assert!(matches!(
        driver.load(&load, artifact.clone(), resident.clone()).await,
        Err(AdapterError::Unsupported)
    ));
    assert!(!root.path().join("helper.pid").exists());
    artifact.native_device.as_mut().unwrap().device = load.selection.devices[0].clone();
    let kernel = driver.load(&load, artifact, resident).await.unwrap();
    assert!(kernel.state().await.unwrap().alive);
    kernel.stop().await.unwrap();
    assert!(!kernel.state().await.unwrap().alive);
}

//! Selected native device utilities. Construction performs no device discovery or execution.
use super::Devices;
use crate::{
    factory::{
        DeviceIdentity, DeviceIdentityData, DeviceResourceObservation,
        DeviceResourceObservationData,
    },
    providers::AdapterError,
};
use ironloom_core::{ActorId, BoxFuture, Counter, DeviceId, HostId};
use sha2::{Digest, Sha256};
use std::{
    path::PathBuf,
    sync::Arc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tokio::io::AsyncReadExt;

const MAX_OUTPUT: usize = 1024 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);
const MIB: u64 = 1024 * 1024;
/// Explicitly selected platform mechanism; unavailable utilities never trigger a fallback probe.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Probe {
    /// Linux/Alpine NVIDIA metadata utility; hardware execution remains unqualified.
    Nvidia,
    /// Service-built Metal helper, authored separately and compiled only on the Mac.
    Metal,
}
/// Trusted execution boundary. Tests inject scripted output and never invoke hardware utilities.
pub trait ProbeRunner: Send + Sync {
    /// Executes only the selected metadata mechanism, without a model load or inference probe.
    fn read(&self, probe: Probe) -> BoxFuture<'_, Result<Vec<u8>, AdapterError>>;
}
/// Bounded utility runner using deployment-selected absolute executable paths.
pub struct ProcessRunner {
    nvidia: Option<PathBuf>,
    metal: Option<PathBuf>,
}
impl ProcessRunner {
    /// Does not search PATH, start a process, discover hardware or choose a backend.
    pub fn new(nvidia: Option<PathBuf>, metal: Option<PathBuf>) -> Result<Self, AdapterError> {
        if [&nvidia, &metal]
            .into_iter()
            .flatten()
            .any(|p| !p.is_absolute())
        {
            return Err(AdapterError::Unsupported);
        }
        Ok(Self { nvidia, metal })
    }
}
impl ProbeRunner for ProcessRunner {
    fn read(&self, probe: Probe) -> BoxFuture<'_, Result<Vec<u8>, AdapterError>> {
        Box::pin(async move {
            let path = match probe {
                Probe::Nvidia => self.nvidia.as_ref(),
                Probe::Metal => self.metal.as_ref(),
            }
            .ok_or(AdapterError::Unsupported)?;
            let mut command = tokio::process::Command::new(path);
            if probe == Probe::Nvidia {
                command.args([
                    "--query-gpu=uuid,memory.total,memory.used",
                    "--format=csv,noheader,nounits",
                ]);
            }
            let mut child = command
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .kill_on_drop(true)
                .spawn()
                .map_err(|_| AdapterError::Unavailable)?;
            let result = tokio::time::timeout(PROBE_TIMEOUT, async {
                let mut output = Vec::new();
                child
                    .stdout
                    .take()
                    .ok_or(AdapterError::Unavailable)?
                    .take((MAX_OUTPUT + 1) as u64)
                    .read_to_end(&mut output)
                    .await
                    .map_err(|_| AdapterError::Unavailable)?;
                if output.len() > MAX_OUTPUT {
                    return Err(AdapterError::Unavailable);
                }
                if !child
                    .wait()
                    .await
                    .map_err(|_| AdapterError::Unavailable)?
                    .success()
                {
                    return Err(AdapterError::Unavailable);
                }
                Ok(output)
            })
            .await
            .unwrap_or(Err(AdapterError::Unavailable));
            if result.is_err() {
                let _ = child.kill().await;
                let _ = child.wait().await;
            }
            result
        })
    }
}
/// Backend address from trusted native metadata, separate from canonical identity reconciliation.
#[derive(Clone)]
pub enum NativeAddress {
    /// CUDA visibility can select this exact vendor UUID without exposing other devices.
    Cuda {
        /// Native GPU/MIG UUID, not an ordinal or a comma-separated group.
        uuid: String,
    },
    /// Metal ordinal is valid only for this metadata snapshot and registry identity.
    Metal {
        /// Exact registry ID retained losslessly as a browser-safe counter.
        registry_id: Counter,
        /// SDK ordinal in the same MTLCopyAllDevices result.
        ordinal: Counter,
        /// Whether the native helper's system-default Metal device matches this identity.
        system_default: bool,
    },
}
/// Unqualified hardware view plus resource observations; central policy reconciles physical identity.
pub struct DeviceView {
    /// Host-scoped UUID/registry identity, always unreconciled until service reconciliation.
    pub identity: DeviceIdentity,
    /// Native handle from this observation; the service must recheck identity before binding it.
    pub address: NativeAddress,
    /// Observed pressure only, with unknown external attribution retained as None.
    pub resources: DeviceResourceObservation,
}
/// Native metadata adapter selected explicitly by infrastructure/configuration.
pub struct NativeDevices {
    host: HostId,
    probe: Probe,
    runner: Arc<dyn ProbeRunner>,
}
impl NativeDevices {
    /// No constructor-side probing. The physical host ID must be supplied by enrollment/configuration.
    pub fn new(host: HostId, probe: Probe, runner: Arc<dyn ProbeRunner>) -> Self {
        Self {
            host,
            probe,
            runner,
        }
    }
    /// Reads selected metadata; tests use a scripted runner. This never qualifies a backend.
    pub async fn observe(&self) -> Result<Vec<DeviceView>, AdapterError> {
        let bytes = self.runner.read(self.probe).await?;
        let now = u64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| AdapterError::Unavailable)?
                .as_millis(),
        )
        .map_err(|_| AdapterError::Unavailable)?;
        self.decode(&bytes, Counter::new(now))
    }
    /// Decodes deterministic native output without executing any discovery utility.
    pub fn decode(&self, bytes: &[u8], observed: Counter) -> Result<Vec<DeviceView>, AdapterError> {
        if bytes.len() > MAX_OUTPUT {
            return Err(AdapterError::Unavailable);
        }
        let mut result = Vec::new();
        match self.probe {
            Probe::Nvidia => {
                let text = std::str::from_utf8(bytes).map_err(|_| AdapterError::Unavailable)?;
                for line in text.lines().filter(|l| !l.trim().is_empty()) {
                    let parts = line.split(',').map(str::trim).collect::<Vec<_>>();
                    if parts.len() != 3
                        || parts[0].is_empty()
                        || parts[0] == "N/A"
                        || parts[0].len() > 256
                    {
                        return Err(AdapterError::Unavailable);
                    }
                    result.push(self.view(
                        &format!("nvidia:{}", parts[0]),
                        NativeAddress::Cuda {
                            uuid: parts[0].into(),
                        },
                        mib(parts[1])?,
                        mib(parts[2])?,
                        observed,
                    )?);
                }
            }
            Probe::Metal => {
                let value: serde_json::Value =
                    serde_json::from_slice(bytes).map_err(|_| AdapterError::Unavailable)?;
                for device in value.as_array().ok_or(AdapterError::Unavailable)? {
                    let registry: Counter = serde_json::from_value(device["registry_id"].clone())
                        .map_err(|_| AdapterError::Unavailable)?;
                    if registry.get() == 0 {
                        return Err(AdapterError::Unavailable);
                    }
                    // Metal's recommended working set is not physical capacity, and currentAllocatedSize
                    // covers only this helper. Neither is misreported as global device memory/pressure.
                    result.push(
                        self.view(
                            &format!("metal-registry:{}", registry.get()),
                            NativeAddress::Metal {
                                registry_id: registry,
                                ordinal: serde_json::from_value(device["ordinal"].clone())
                                    .map_err(|_| AdapterError::Unavailable)?,
                                system_default: device["system_default"]
                                    .as_bool()
                                    .ok_or(AdapterError::Unavailable)?,
                            },
                            None,
                            None,
                            observed,
                        )?,
                    );
                }
            }
        }
        let mut ordinals = std::collections::BTreeSet::new();
        let mut defaults = 0;
        for view in &result {
            if let NativeAddress::Metal {
                ordinal,
                system_default,
                ..
            } = &view.address
            {
                if !ordinals.insert(ordinal.get()) {
                    return Err(AdapterError::Unavailable);
                }
                defaults += usize::from(*system_default);
            }
        }
        if defaults > 1 {
            return Err(AdapterError::Unavailable);
        }
        let mut unique = std::collections::BTreeSet::new();
        if result
            .iter()
            .any(|v| !unique.insert(v.identity.device_id.clone()))
        {
            return Err(AdapterError::Unavailable);
        }
        Ok(result)
    }
    fn view(
        &self,
        key: &str,
        address: NativeAddress,
        total: Option<u64>,
        used: Option<u64>,
        observed: Counter,
    ) -> Result<DeviceView, AdapterError> {
        let id = DeviceId::new(hex::encode(Sha256::digest(format!(
            "{}\0{key}",
            self.host.as_str()
        ))))
        .map_err(|_| AdapterError::Unavailable)?;
        let identity = DeviceIdentity::new(DeviceIdentityData {
            device_id: id.clone(),
            host_id: self.host.clone(),
            parent_id: None,
            hardware_key: ActorId::new(key).map_err(|_| AdapterError::Unavailable)?,
            reconciled: false,
        })
        .map_err(|_| AdapterError::Unavailable)?;
        let resources = DeviceResourceObservation::new(DeviceResourceObservationData {
            device_id: id,
            total_bytes: total.map(Counter::new),
            used_bytes: used.map(Counter::new),
            external_used_bytes: None,
            observed_at_ms: observed,
        })
        .map_err(|_| AdapterError::Unavailable)?;
        Ok(DeviceView {
            identity,
            address,
            resources,
        })
    }
}
impl Devices for NativeDevices {
    fn discover(&self) -> BoxFuture<'_, Result<Vec<DeviceIdentity>, AdapterError>> {
        Box::pin(async {
            Ok(self
                .observe()
                .await?
                .into_iter()
                .map(|view| view.identity)
                .collect())
        })
    }
}
fn mib(value: &str) -> Result<Option<u64>, AdapterError> {
    if value == "N/A" || value == "[Not Supported]" {
        return Ok(None);
    }
    value
        .parse::<u64>()
        .ok()
        .and_then(|n| n.checked_mul(MIB))
        .map(Some)
        .ok_or(AdapterError::Unavailable)
}

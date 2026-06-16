#![forbid(unsafe_code)]

use ed25519_dalek::{Signer, SigningKey};
use ironloom_core::RepositorySlug;
use ironloom_github::{CheckRunConclusion, CheckRunStatus, GitHubHttpTransport};
use ironloom_sonarcloud::{QualityGateStatus, SonarCloudHttpTransport, SonarCloudIssueSeverity};

const ED25519_SEED_BYTES: usize = 32;
const IRONLOOM_GITHUB_PULL_REQUEST_NUMBER_ENV: &str = "IRONLOOM_GITHUB_PULL_REQUEST_NUMBER";
const IRONLOOM_GITHUB_CHECK_REF_ENV: &str = "IRONLOOM_GITHUB_CHECK_REF";

fn main() {
    let mut args = std::env::args().skip(1);
    match args.next().as_deref() {
        Some("serve") => {
            let bind_addr =
                std::env::var("IRONLOOM_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_owned());
            if let Err(error) = ironloom_runtime::run_health_server(&bind_addr) {
                eprintln!("failed to start ironloom runtime: {error}");
                std::process::exit(1);
            }
        }
        Some("proof") => {
            let project_dir = args
                .next()
                .unwrap_or_else(|| "/var/lib/ironloom/worktrees/ironloom-proof-app".to_owned());
            let runtime_root = std::env::current_dir().unwrap_or_else(|_| ".".into());
            match ironloom_runtime::run_complete_software_proof(&runtime_root, &project_dir) {
                Ok(output) => {
                    println!("Ironloom proof project created");
                    println!("project_dir={}", output.project_dir.display());
                    println!("index_path={}", output.index_path.display());
                    println!("manifest_path={}", output.manifest_path.display());
                    println!("selected_process_node={}", output.selected_process_node);
                    println!("artifact_count={}", output.persisted_artifact_ids.len());
                }
                Err(error) => {
                    eprintln!("failed to create proof project: {error}");
                    std::process::exit(1);
                }
            }
        }
        Some("sign-discord-fixture") => {
            let seed = args.next();
            let timestamp = args.next();
            let body = args.next();
            match (seed, timestamp, body) {
                (Some(seed), Some(timestamp), Some(body)) => {
                    if let Err(error) = sign_discord_fixture(&seed, &timestamp, &body) {
                        eprintln!("failed to sign Discord fixture: {error}");
                        std::process::exit(1);
                    }
                }
                _ => {
                    eprintln!(
                        "usage: ironloom sign-discord-fixture <32-byte-seed-hex> <timestamp> <body>"
                    );
                    std::process::exit(2);
                }
            }
        }
        Some("external-probe") => {
            let repository = args.next();
            match repository {
                Some(repository) => {
                    if let Err(error) = probe_external_adapters(&repository) {
                        eprintln!("{error}");
                        std::process::exit(1);
                    }
                }
                None => {
                    eprintln!("usage: ironloom external-probe <github-owner/repo>");
                    std::process::exit(2);
                }
            }
        }
        _ => {
            println!("ironloom runtime");
        }
    }
}

fn probe_external_adapters(repository: &str) -> Result<(), String> {
    let repository =
        RepositorySlug::new(repository).map_err(|error| format!("invalid repository: {error}"))?;
    let config = ironloom_config::RuntimeConfig::from_environment()
        .map_err(|error| format!("failed to resolve runtime config: {error}"))?;
    let summary = ironloom_runtime::probe_runtime_external_services_with_options(
        &config,
        &repository,
        GitHubHttpTransport::public_api(),
        SonarCloudHttpTransport::public_api(),
        external_probe_options()?,
    )
    .map_err(|error| format!("external probe failed: {error}"))?;
    let issues = summary
        .open_sonarcloud_issues
        .iter()
        .map(|issue| {
            serde_json::json!({
                "key": issue.key,
                "severity": sonarcloud_issue_severity(&issue.severity),
                "type": issue.issue_type,
                "message": issue.message,
                "status": issue.status,
            })
        })
        .collect::<Vec<_>>();
    let mut output = serde_json::json!({
        "github_repository": {
            "repository": summary.github_repository.repository.as_str(),
            "default_branch": summary.github_repository.default_branch,
            "source_of_truth": summary.github_repository.source_of_truth,
        },
        "sonarcloud": {
            "quality_gate_status": quality_gate_status(&summary.quality_gate_status),
            "open_issue_count": issues.len(),
            "open_issues": issues,
        }
    });
    if let Some(pull_request) = &summary.github_pull_request {
        output["github_pull_request"] = serde_json::json!({
            "repository": pull_request.repository.as_str(),
            "number": pull_request.number,
            "head_branch": pull_request.head_branch,
            "base_branch": pull_request.base_branch,
            "draft": pull_request.draft,
            "mergeable": pull_request.mergeable,
            "mergeable_state": pull_request.mergeable_state,
            "source_of_truth": pull_request.source_of_truth,
        });
    }
    if !summary.github_check_runs.is_empty() {
        let check_runs = summary
            .github_check_runs
            .iter()
            .map(|check_run| {
                serde_json::json!({
                    "name": check_run.name,
                    "status": check_run_status(&check_run.status),
                    "conclusion": check_run.conclusion.as_ref().map(check_run_conclusion),
                    "source_of_truth": check_run.source_of_truth,
                })
            })
            .collect::<Vec<_>>();
        output["github_check_runs"] = serde_json::json!(check_runs);
    }
    println!(
        "{}",
        serde_json::to_string_pretty(&output).map_err(|error| error.to_string())?
    );
    Ok(())
}

fn external_probe_options() -> Result<ironloom_runtime::RuntimeExternalProbeOptions, String> {
    let pull_request_number = match std::env::var(IRONLOOM_GITHUB_PULL_REQUEST_NUMBER_ENV) {
        Ok(value) if !value.trim().is_empty() => Some(value.parse::<u64>().map_err(|_| {
            format!("{IRONLOOM_GITHUB_PULL_REQUEST_NUMBER_ENV} must be an unsigned integer")
        })?),
        _ => None,
    };
    let check_ref = match std::env::var(IRONLOOM_GITHUB_CHECK_REF_ENV) {
        Ok(value) if !value.trim().is_empty() => Some(value),
        _ => None,
    };
    Ok(ironloom_runtime::RuntimeExternalProbeOptions {
        pull_request_number,
        check_ref,
    })
}

fn quality_gate_status(status: &QualityGateStatus) -> &'static str {
    match status {
        QualityGateStatus::Passed => "passed",
        QualityGateStatus::Failed => "failed",
        QualityGateStatus::Pending => "pending",
    }
}

fn check_run_status(status: &CheckRunStatus) -> &'static str {
    match status {
        CheckRunStatus::Queued => "queued",
        CheckRunStatus::InProgress => "in_progress",
        CheckRunStatus::Completed => "completed",
        CheckRunStatus::Unknown => "unknown",
    }
}

fn check_run_conclusion(conclusion: &CheckRunConclusion) -> &'static str {
    match conclusion {
        CheckRunConclusion::Success => "success",
        CheckRunConclusion::Failure => "failure",
        CheckRunConclusion::Cancelled => "cancelled",
        CheckRunConclusion::Skipped => "skipped",
        CheckRunConclusion::TimedOut => "timed_out",
        CheckRunConclusion::ActionRequired => "action_required",
        CheckRunConclusion::Neutral => "neutral",
        CheckRunConclusion::Stale => "stale",
        CheckRunConclusion::Unknown => "unknown",
    }
}

fn sonarcloud_issue_severity(severity: &SonarCloudIssueSeverity) -> &'static str {
    match severity {
        SonarCloudIssueSeverity::Blocker => "blocker",
        SonarCloudIssueSeverity::Critical => "critical",
        SonarCloudIssueSeverity::Major => "major",
        SonarCloudIssueSeverity::Minor => "minor",
        SonarCloudIssueSeverity::Info => "info",
        SonarCloudIssueSeverity::Unknown => "unknown",
    }
}

fn sign_discord_fixture(seed_hex: &str, timestamp: &str, body: &str) -> Result<(), String> {
    let seed = decode_seed(seed_hex)?;
    let signing_key = SigningKey::from_bytes(&seed);
    let signature = signing_key.sign(format!("{timestamp}{body}").as_bytes());
    println!(
        "public_key={}",
        hex::encode(signing_key.verifying_key().to_bytes())
    );
    println!("signature={}", hex::encode(signature.to_bytes()));
    Ok(())
}

fn decode_seed(seed_hex: &str) -> Result<[u8; ED25519_SEED_BYTES], String> {
    let decoded = hex::decode(seed_hex).map_err(|error| error.to_string())?;
    decoded
        .try_into()
        .map_err(|_| "seed must decode to exactly 32 bytes".to_owned())
}

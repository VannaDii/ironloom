use std::fs;
use std::process::Command;

use ironloom_runtime::run_complete_software_proof;

#[test]
fn proof_project_runs_vertical_slice_and_writes_complete_static_app() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let project_dir = temp.path().join("ironloom-proof-app");

    let output = run_complete_software_proof(temp.path(), &project_dir)
        .expect("proof project should be generated");

    assert_eq!(project_dir, output.project_dir);
    assert_eq!(project_dir.join("index.html"), output.index_path);
    assert_eq!(
        project_dir.join("ironloom-proof.json"),
        output.manifest_path
    );
    assert_eq!("run_gate_worker", output.selected_process_node);
    assert_eq!(1, output.persisted_artifact_ids.len());
    assert!(project_dir.join("README.md").exists());
    assert!(project_dir.join("style.css").exists());
    assert!(project_dir.join("app.js").exists());

    let html =
        fs::read_to_string(project_dir.join("index.html")).expect("proof HTML should be readable");
    assert!(html.contains("Ironloom Proof App"));

    let manifest = fs::read_to_string(project_dir.join("ironloom-proof.json"))
        .expect("proof manifest should be readable");
    assert!(manifest.contains("\"complete_software\""));
    assert!(manifest.contains("\"run_gate_worker\""));

    let artifact_dir = temp.path().join(".ironloom").join("artifacts");
    let artifact_count = fs::read_dir(artifact_dir)
        .expect("artifact directory should exist")
        .count();
    assert_eq!(1, artifact_count);
}

#[test]
fn proof_cli_creates_complete_static_app_under_requested_directory() {
    let temp = tempfile::tempdir().expect("temp dir should exist");
    let project_dir = temp.path().join("cli-proof-app");

    let output = Command::new(env!("CARGO_BIN_EXE_ironloom"))
        .current_dir(temp.path())
        .arg("proof")
        .arg(&project_dir)
        .output()
        .expect("proof command should run");

    assert!(
        output.status.success(),
        "proof command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(project_dir.join("index.html").exists());
    assert!(project_dir.join("ironloom-proof.json").exists());
    assert!(String::from_utf8_lossy(&output.stdout).contains("Ironloom proof project created"));
}

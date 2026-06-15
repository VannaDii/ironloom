#![forbid(unsafe_code)]

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
        _ => {
            println!("ironloom runtime");
        }
    }
}

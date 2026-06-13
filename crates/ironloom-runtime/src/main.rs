#![forbid(unsafe_code)]

fn main() {
    let mut args = std::env::args().skip(1);
    if matches!(args.next().as_deref(), Some("serve")) {
        if let Err(error) = ironloom_config::RuntimeConfig::from_environment() {
            eprintln!("invalid ironloom runtime configuration: {error}");
            std::process::exit(1);
        }
        let bind_addr =
            std::env::var("IRONLOOM_BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_owned());
        if let Err(error) = ironloom_runtime::run_health_server(&bind_addr) {
            eprintln!("failed to start ironloom runtime: {error}");
            std::process::exit(1);
        }
    } else {
        println!("ironloom runtime");
    }
}

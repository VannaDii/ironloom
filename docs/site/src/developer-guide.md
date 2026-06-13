# Developer Guide

Run the Rust validation gates before publishing changes:

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
```

Public contracts live near their owning crates and are represented by committed schema files under `crates/*/schemas`.

Generate schema files from the Rust contract types after public contract changes:

```sh
cargo run -p ironloom-schemas
```

Verify committed schema files have no drift:

```sh
cargo run -p ironloom-schemas -- --check
```

# Contributing

Run the Rust and documentation validation gates before publishing changes.

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
npm run docs:build
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

## Documentation Development

Run the VitePress development server with:

```sh
npm run docs:dev
```

Build the static site with:

```sh
npm run docs:build
```

When functionality changes affect a documented surface, update the English source docs and every localized docs tree in the same change.

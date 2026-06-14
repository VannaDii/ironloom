# योगदान

Changes publish करने से पहले Rust और documentation validation gates चलाएं।

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
npm run docs:build
```

Public contracts अपने owning crates के पास रहते हैं और `crates/*/schemas` के अंतर्गत committed schema files से represented होते हैं।

Public contract changes के बाद Rust contract types से schema files generate करें:

```sh
cargo run -p ironloom-schemas
```

Committed schema files में drift न हो, यह verify करें:

```sh
cargo run -p ironloom-schemas -- --check
```

## Documentation Development

VitePress development server चलाएं:

```sh
npm run docs:dev
```

Static site build करें:

```sh
npm run docs:build
```

जब functionality documented surface को प्रभावित करती है, तो उसी change में English source docs और सभी localized docs update करें।

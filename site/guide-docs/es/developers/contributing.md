# Contribuir

Ejecuta los controles de validación de Rust y documentación antes de publicar cambios.

```sh
cargo fmt --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo deny check
cargo audit
npm run docs:build
```

Los contratos públicos viven cerca de sus crates propietarios y se representan con archivos de esquema comprometidos bajo `crates/*/schemas`.

Genera archivos de esquema desde los tipos de contrato Rust después de cambios en contratos públicos:

```sh
cargo run -p ironloom-schemas
```

Verifica que los archivos de esquema comprometidos no tengan drift:

```sh
cargo run -p ironloom-schemas -- --check
```

## Desarrollo de documentación

Ejecuta el servidor de desarrollo de VitePress con:

```sh
npm run docs:dev
```

Construye el sitio estático con:

```sh
npm run docs:build
```

Cuando un cambio de funcionalidad afecte una superficie documentada, actualiza los documentos fuente en inglés y todos los documentos localizados dentro del mismo cambio.

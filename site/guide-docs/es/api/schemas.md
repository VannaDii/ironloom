# API de esquemas

Los esquemas JSON comprometidos viven bajo directorios `schemas/` locales de cada crate.

## Drift de esquemas

Verifica los esquemas con:

```sh
cargo run -p ironloom-schemas -- --check
```

Regenera archivos de esquema después de cambios en contratos públicos con:

```sh
cargo run -p ironloom-schemas
```

## Esquemas de configuración de runtime

- `crates/ironloom-config/schemas/runtime-config.schema.json`
- `crates/ironloom-config/schemas/stored-setup-config.schema.json`

Estos describen la configuración de runtime resuelta y la forma del payload de setup cifrado.

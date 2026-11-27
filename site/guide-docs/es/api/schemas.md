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

## Contratos candidatos de la fábrica

Los contratos nuevos están en los módulos `src/factory.rs` de cada crate. `Validated<T>` aplica las mismas comprobaciones de campos anidados y relaciones entre campos al construir y decodificar; los errores estructurados no revelan secretos. Los contadores y las revisiones se representan como cadenas decimales canónicas para conservar la precisión en el navegador. Rust y Dart comparten `fixtures/contracts/decode.json`. Los registros nuevos `FactoryArtifact` no requieren un hilo de Discord; los registros históricos de la versión uno siguen siendo legibles. Estos contratos e interfaces todavía no implementan la fábrica, el inicio de sesión, el transporte nativo ni la inferencia. La [especificación compartida](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) detalla responsabilidades, rutas de API, migraciones y límites de validación.

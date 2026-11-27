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

Los contratos nuevos están en los módulos `src/factory.rs` de cada crate. `Validated<T>` aplica las mismas comprobaciones de campos anidados y relaciones entre campos al construir y decodificar; los errores estructurados no revelan secretos. Los contadores y las revisiones se representan como cadenas decimales canónicas para conservar la precisión en el navegador. Rust y Dart comparten `fixtures/contracts/decode.json`. Los registros nuevos `FactoryArtifact` no requieren un hilo de Discord; no se ofrece soporte para formatos antiguos. Estos contratos e interfaces todavía no implementan la fábrica, el inicio de sesión, el transporte nativo ni la inferencia. La [especificación compartida](https://github.com/VannaDii/ironloom/blob/feat/shared-factory-contracts/docs/specs/ironloom-shared-contracts.md) detalla responsabilidades, rutas de API, inicialización del esquema y límites de validación.

La revisión añade historial vinculado a una instantánea y una interfaz de suscripción limitada que une la reproducción con los eventos en vivo, respuestas de selección múltiple y texto libre, mensajes de inferencia con roles y esquemas/resultados de herramientas, e identidades nativas separadas de servidor y entorno con claves de persistencia del relay. Son interfaces validadas; sus implementaciones siguen pendientes.

La misma revisión define consultas y cambios autorizados de configuración, equipo, modelos y dispositivos; revisión, edición, ámbito, eliminación y promoción de lecciones; búsqueda paginada de fuentes; y datos explícitos de borradores, caché, recursos y recuperación del motor. Los datos desconocidos siguen siendo desconocidos; los fallos y las solicitudes de cancelación no confirman la terminación ni liberan reservas. Las implementaciones siguen pendientes.

Ironloom aún no se ha publicado: solo se inicializan esquemas nuevos, sin compatibilidad con versiones antiguas, conversiones, rellenos de datos, archivos de actualización ni historial de migraciones. El código obsoleto se retira durante el desarrollo inicial.

`FactoryService::create_conversation` guarda una conversación vacía autorizada antes de iniciar un turno nativo, con identidad de comando duradera e instantánea con cursor cero. No envía texto ni inicia inferencia; el texto del usuario sigue siendo obligatorio.

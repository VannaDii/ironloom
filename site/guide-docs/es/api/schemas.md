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

Los contratos compartidos del servicio y del registro nativo ahora están en `ironloom-service::factory`; el runtime y los adaptadores nativos dependen de este crate común, sin alias de importación antiguos. Las instantáneas incluyen la asignación activa para reconectar. Hay registros explícitos para proyectos, credenciales, conexiones nativas y fuentes/descargas; los perfiles guardan controles de generación mediante la configuración.

`POST /api/v1/models/assessments` devuelve evaluaciones tipadas por motor, versión, backend y dispositivos canónicos, separando supuestos, ajuste de memoria y validación real. Lo desconocido sigue siendo desconocido; la evaluación no carga ni ejecuta modelos.

`GET /api/v1/models/inventory` muestra procedencia autorizada, finalización de transferencia, verificación independiente de integridad/manifiesto y disponibilidad actual. Los bytes completos no equivalen a instalación verificada; los archivos ausentes conservan metadatos y bloquean el uso.

Los comandos de configuración de la instalación se guardan antes de crear proyectos. Las conversaciones vacías conservan atómicamente su estado y recibo de reintento con cursor cero, sin evento de ejecución. `DownloadProgress.repository_id` vincula reanudación y cancelación al repositorio autorizado original.

Los límites de descarga de infraestructura son obligatorios: `IRONLOOM_DOWNLOAD_MAX_FILE_BYTES` y `IRONLOOM_DOWNLOAD_MAX_TRANSFER_BYTES`. Ambos deben ser cantidades decimales positivas de bytes; los tamaños del editor no los sustituyen. Helm proporciona valores explícitos editables.

Las plantillas editables usan `GET/POST /api/v1/instructions`; los cambios conservan explícitamente las copias activas o seleccionan asignaciones autorizadas para actualización y confirmación. Los comandos de presupuesto incluyen `{conversation_id, budget}` para identificar el flujo persistente correcto.

Un `ServiceEvent` contiene exactamente un evento de trabajador o una actualización de estado de conversación. El cursor y proyecto de la actualización deben coincidir con el evento exterior; no se inventan identidades de ejecución para cambios de estado.

El equipo estándar comienza deshabilitado, con instrucciones editables y sin modelo inferido. Las reglas puras conservan la herencia por proyecto y permiten perfiles remotos configurados sin GPU. Los controladores persistentes de instrucciones y configuración siguen en implementación.

La delegación del trabajador se limita a su asignación y recurso; CAS conserva el proyecto y la asignación propietarios. La disponibilidad comprueba PostgreSQL y el enlace OpenFGA real, independientemente de la configuración de modelos. La estimación de memoria exige los cinco componentes y suma sin desbordamiento; los datos incompletos siguen siendo desconocidos.


La paginación del historial requiere una dirección explícita, permite filtrar por turno y conserva el orden cronológico dentro de cada página en la secuencia de eventos solicitada. La búsqueda de conversaciones requiere `order=created_at` para clientes nativos u `order=human_interaction` para el panel. Las ubicaciones locales vacías, desactivadas o sin intersección impiden la ejecución. Las rutas HTTP de configuración, instrucciones e historial usan el servicio autenticado compartido; la composición completa sigue en desarrollo.


`CommandReceipt.cursor` no aparece en cambios de recursos sin eventos. Gestionar una lección compartida no requiere acceso a su conversación privada de origen ni revela su cursor. Los comandos de conversación conservan cursores reales. La configuración rechaza roles duplicados y no añade una selección inicial obligatoria.

Los permisos de Linux distinguen archivos exactos `write_files` y subárboles `write_directories`. Crear, editar, eliminar y mover archivos exactos usa herramientas nativas; los comandos reciben solo montajes explícitos de directorios. Los árboles escribibles rechazan enlaces duros y seccomp bloquea enlaces nuevos. La propiedad persistente de rutas permanece hasta confirmar la detención o conciliación, incluso tras vencer el arrendamiento. La integración completa de la pasarela sigue en curso.

`ConversationSnapshot.pause_requested`: `null` indica que no hay asignación activa; `false`, que no hay pausa pendiente; `true`, que se espera confirmación en un límite seguro.

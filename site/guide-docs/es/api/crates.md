# API de crates

Ironloom mantiene estrictas las responsabilidades de cada crate para que la orquestación del runtime permanezca separada de la lógica de dominio.

| Crate | Responsabilidad |
| --- | --- |
| `ironloom-core` | IDs tipados, primitivas de repositorio y rama, errores compartidos. |
| `ironloom-config` | Resolución de configuración de runtime, controles de configuración y precedencia del entorno. |
| `ironloom-artifacts` | Envoltorios de artefactos inmutables y contratos de esquema. |
| `ironloom-storage` | Estado del sistema de archivos `.ironloom/`, índices y configuración cifrada. |
| `ironloom-policy` | Decisiones de política que fallan de forma cerrada. |
| `ironloom-process-graph` | Validación y enrutamiento del process graph tipado. |
| `ironloom-queue` | Contratos duraderos del ciclo de vida de work items. |
| `ironloom-observability` | Registros de auditoría y telemetría. |
| `ironloom-worktrees` | Seguridad de worktrees locales de git. |
| `ironloom-gates` | Contratos de ejecución de controles. |
| `ironloom-workers` | Envoltorios de solicitud y respuesta de workers. |
| `ironloom-supervisor` | Selección de rutas del process graph y despacho de workers. |
| `ironloom-discord` | Adaptador de operador consciente de hilos. |
| `ironloom-github` | Proyecciones de fuente de verdad de GitHub. |
| `ironloom-sonarcloud` | Normalización de calidad y cumplimiento de SonarCloud. |
| `ironloom-runtime` | Composición del servicio, health, readiness y superficie HTTP de configuración inicial. |

# API de crates

Ironloom mantiene estrictas las responsabilidades de cada crate para que la orquestación del runtime permanezca separada de la lógica de dominio.

| Crate | Responsabilidad |
| --- | --- |
| `ironloom-core` | IDs tipados, primitivas de repositorio y rama, errores compartidos. |
| `ironloom-config` | Resolución de configuración de runtime, controles de configuración y precedencia del entorno. |
| `ironloom-artifacts` | Envoltorios de artefactos inmutables y contratos de esquema. |
| `ironloom-storage` | Estado del sistema de archivos `.ironloom/`, índices de artefactos, configuración cifrada y vínculos persistidos de hilo. |
| `ironloom-policy` | Decisiones de política que fallan de forma cerrada. |
| `ironloom-process-graph` | Validación y enrutamiento del process graph tipado. |
| `ironloom-queue` | Contratos duraderos del ciclo de vida de work items. |
| `ironloom-observability` | Registros de auditoría y telemetría. |
| `ironloom-worktrees` | Seguridad de worktrees locales de git. |
| `ironloom-gates` | Contratos de controles y ejecución de comandos permitidos con timeouts, directorios de trabajo, control de entorno y streams capturados. |
| `ironloom-workers` | Envoltorios de solicitud/respuesta y registro de workers en proceso. |
| `ironloom-supervisor` | Selección de rutas del process graph y despacho de workers mediante registro. |
| `ironloom-discord` | Adaptador de operador consciente de hilos con verificación de interacciones HTTP firmadas. |
| `ironloom-github` | Solicitudes API de GitHub como fuente de verdad, transporte HTTP y proyecciones de repositorio, pull request y check-runs. |
| `ironloom-sonarcloud` | Bootstrap de SonarCloud, transporte HTTP, polling de quality gate y normalización de issues. |
| `ironloom-runtime` | Composición del servicio, health, readiness y superficie HTTP de configuración inicial. |

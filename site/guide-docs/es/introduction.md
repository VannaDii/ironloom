# Introducción

Ironloom es un runtime supervisor en Rust de Veritas Labs para operaciones de ingeniería auditables.

Coordina acciones de operador en Discord, estado fuente de verdad en GitHub, controles de calidad de SonarCloud, ejecución de workers, artefactos inmutables y despliegues en k3s mediante un runtime Rust directo.

## Flujo del sistema

```mermaid
flowchart LR
  operator["Operador de Discord"] --> discord["ironloom-discord"]
  discord --> runtime["ironloom-runtime"]
  runtime --> supervisor["ironloom-supervisor"]
  supervisor --> policy["ironloom-policy"]
  supervisor --> graph["ironloom-process-graph"]
  graph --> workers["ironloom-workers"]
  workers --> github["Fuente de verdad en GitHub"]
  workers --> sonar["Controles de SonarCloud"]
  workers --> storage["ironloom-storage"]
  storage --> artifacts[(".ironloom artefactos")]
  supervisor --> discord
  runtime --> k3s["Despliegue k3s"]
```

## Forma de la plataforma

- Discord es la interfaz principal del operador.
- GitHub sigue siendo la fuente de verdad para repositorios, pull requests, checks y estado de merge.
- SonarCloud sigue siendo el control de calidad y cumplimiento.
- La entrega en Kubernetes apunta a k3s mediante el chart Helm de Ironloom.
- El estado del runtime se almacena bajo `.ironloom` con artefactos e índices auditables.

## Mapa de documentación

- Las [guías](/es/guides/getting-started) cubren configuración, despliegue y flujos de operación.
- Los [docs para desarrollo](/es/developers/architecture) explican límites de crates y controles de validación.
- Los [docs de API](/es/api/) referencian configuración, rutas HTTP, almacenamiento, esquemas y crates.
- La [salida LLM](/llms.txt) expone el contenido del sitio en forma legible por modelos.

Los controles de operador permanecen en Discord, GitHub y el plano de control del runtime. Este sitio estático no conserva credenciales de runtime ni ejecuta acciones de ciclo de vida.

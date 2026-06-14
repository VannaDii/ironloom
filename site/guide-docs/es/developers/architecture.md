# Arquitectura

Ironloom enruta trabajo mediante un process graph tipado. El supervisor valida políticas, selecciona un worker, registra artefactos inmutables bajo `.ironloom` y reporta resultados a la superficie de control de origen.

Los adaptadores de Discord, GitHub y SonarCloud permanecen en los bordes. Las reglas de negocio viven en crates core, policy, process graph, workers y supervisor.

## Límites del runtime

```mermaid
flowchart TB
  runtime["ironloom-runtime"]
  runtime --> config["ironloom-config"]
  runtime --> supervisor["ironloom-supervisor"]
  runtime --> storage["ironloom-storage"]
  supervisor --> policy["ironloom-policy"]
  supervisor --> graph["ironloom-process-graph"]
  supervisor --> workers["ironloom-workers"]
  workers --> gates["ironloom-gates"]
  workers --> github["ironloom-github"]
  workers --> sonar["ironloom-sonarcloud"]
  storage --> artifacts[(".ironloom estado")]
  discord["ironloom-discord"] --> runtime
  core["ironloom-core"] --> config
  core --> policy
  core --> graph
  core --> workers
```

## Reglas de límite

- `ironloom-runtime` es el servicio desplegable y el límite de composición.
- `ironloom-supervisor` posee las decisiones de enrutamiento de procesos y despacho de workers.
- `ironloom-discord` es el adaptador del plano de control del operador.
- `ironloom-github` lee y escribe estado fuente de verdad de GitHub mediante solicitudes auditables.
- `ironloom-sonarcloud` posee la normalización de calidad y cumplimiento de SonarCloud.
- `ironloom-storage` posee el acceso directo al sistema de archivos `.ironloom/`.

## Primer corte vertical

1. Un comando falso de Discord se vincula exactamente a un hilo y work item.
2. El adaptador de Discord falla cerrado ante vínculos faltantes o ambiguos.
3. El supervisor selecciona el worker de control mediante el process graph.
4. La política permite solo una acción de control no destructiva vinculada a hilo.
5. El worker de control devuelve un resultado estructurado.
6. Storage escribe un artefacto inmutable bajo `.ironloom` y lo indexa por hilo y work item.
7. El transporte falso de Discord responde al hilo de origen.

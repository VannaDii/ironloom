# Flujos de operación

Las acciones de Discord que cambian ciclo de vida deben estar vinculadas exactamente a un work item persistido y a un hilo. Un contexto de hilo faltante o ambiguo falla cerrado antes de que se ejecute cualquier worker.

## Secuencia de comandos

```mermaid
sequenceDiagram
  participant Operator as Operador
  participant Discord as Discord
  participant Runtime as Runtime
  participant Supervisor as Supervisor
  participant GitHub as GitHub
  participant Worker as Worker
  participant Storage as Storage
  Operator->>Discord: Envía slash command en un hilo
  Discord->>Runtime: POST de interacción firmada
  Runtime->>Runtime: Verifica firma y resuelve vínculo de hilo
  alt vínculo faltante o ambiguo
    Runtime-->>Discord: Devuelve respuesta fail-closed de canal
    Discord-->>Operator: Explica el vínculo fallido en el hilo
  else vínculo válido
    Runtime->>Supervisor: Enruta comando vinculado al hilo
    Supervisor->>GitHub: Refresca estado fuente de verdad
    Supervisor->>Worker: Despacha worker elegido por el grafo y el registro
    Worker->>Storage: Escribe artefacto inmutable
    Worker-->>Supervisor: Devuelve resultado estructurado
    Supervisor-->>Runtime: Publica resultado
    Runtime-->>Discord: Devuelve respuesta de mensaje de canal
    Discord-->>Operator: Responde al hilo original
  end
```

## Vinculación de hilo

Ironloom trata el hilo de Discord como el contexto del operador. Un comando debe resolverse a un único work item antes de ejecutar políticas o despacho de workers.

## Estado de GitHub

El estado de GitHub debe refrescarse antes de decisiones sobre pull requests, ramas, checks, reviews o merges. El estado cacheado puede ayudar con visualización e indexación, pero no es la fuente de verdad.

## Artefactos

El supervisor almacena artefactos inmutables bajo `.ironloom` y los indexa por hilo y work item. Las respuestas para operadores deben apuntar de vuelta al hilo de origen.

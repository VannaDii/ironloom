# ऑपरेटर वर्कफ्लो

Lifecycle-changing Discord actions exactly one persisted work item और thread से bound होने चाहिए। Missing या ambiguous thread context किसी worker के run होने से पहले fail closed करता है।

## Command Sequence

```mermaid
sequenceDiagram
  participant Operator as Discord ऑपरेटर
  participant Discord as ironloom-discord
  participant Runtime as ironloom-runtime
  participant Supervisor as ironloom-supervisor
  participant GitHub as ironloom-github
  participant Worker as ironloom-workers
  participant Storage as ironloom-storage

  Operator->>Discord: Thread command submit करें
  Discord->>Runtime: Bound request भेजें
  Runtime->>Supervisor: Route resolve करें
  Supervisor->>GitHub: Source-of-truth state refresh करें
  GitHub-->>Supervisor: Current repository state
  Supervisor->>Supervisor: Policy और process graph apply करें
  alt Thread binding missing या ambiguous है
    Supervisor-->>Discord: Action reject करें
    Discord-->>Operator: Failed binding explain करें
  else Thread binding unambiguous है
    Supervisor->>Worker: Work dispatch करें
    Worker-->>Supervisor: Structured result लौटाएं
    Supervisor->>Storage: Immutable artifact लिखें
    Storage-->>Supervisor: Artifact index updated
    Supervisor-->>Discord: Audited outcome लौटाएं
    Discord-->>Operator: Originating thread में reply करें
  end
```

## Thread Binding

Ironloom Discord thread को operator context मानता है। Policy या worker dispatch चलने से पहले command को single work item में resolve होना चाहिए।

## GitHub State

Pull request, branch, check, review या merge decisions से पहले GitHub state refresh करना चाहिए। Cached state display और indexing support कर सकता है, लेकिन वह source of truth नहीं है।

## Artifacts

Supervisor immutable artifacts को `.ironloom` के अंतर्गत store करता है और उन्हें thread तथा work item से index करता है। Operator-facing responses को originating thread की ओर point करना चाहिए।

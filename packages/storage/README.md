# @vannadii/devplat-storage

Lightweight file-backed adapter over `.devplat`.

## Responsibility

This package owns direct `.devplat` reads and writes, layout versioning, storage paths, and index materialization for active thread, task, pull request, branch, and artifact lookups.

## Real-World Flow

```mermaid
flowchart LR
  Service[Package service] --> Record[Stored record]
  Record --> Layout[Versioned layout path]
  Record --> Index[Active thread task PR branch artifact index]
  Layout --> Disk[.devplat JSON]
  Index --> Lookup[Fast lifecycle lookup]
```

## Boundaries

- This is the only package that may directly read or write `.devplat` paths.
- Keep storage format auditable JSON.
- Do not own lifecycle transitions for stored domain records.

## Development

```bash
npm run test --workspace @vannadii/devplat-storage
```

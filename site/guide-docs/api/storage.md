# Storage API

Only `ironloom-storage` reads or writes `.ironloom/` paths directly.

## Artifact Storage

Artifacts are persisted under the runtime state root and indexed by Discord thread and work item. Writes use a temporary file followed by an atomic rename.

## Thread Bindings

Thread bindings are persisted under the `.ironloom` index tree. Runtime command intake resolves a Discord thread to exactly one work item before policy, process graph routing, or worker dispatch can run. Missing, invalid, or ambiguous bindings fail closed.

## Encrypted Setup Storage

Local setup configuration is stored at:

```text
${IRONLOOM_STATE_ROOT}/setup/config.enc.json
```

The file stores:

- encrypted JSON setup payload
- random nonce
- setup storage version

The plaintext setup values are not written to disk. Unix writes use owner-only file permissions.

## Key Requirement

`IRONLOOM_CONFIG_KEY` must be base64-encoded 32-byte key material. A recreated pod with the same PVC must receive the same key to decrypt saved setup.

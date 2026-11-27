# Ironloom Software Factory Plan

Status: agreed product direction recorded on 2026-11-27; implementation remains pending. This document does not authorize implementation, local inference, Python embedding, or engine porting. Unresolved decisions are listed below.

This plan supersedes the product direction in [the Rust migration plan](ironloom-rust-platform-migration.md). [PLATFORM.md](../../PLATFORM.md) remains the authoritative foundation-scope document. Keep this specification in the repository so GitHub remains the source of truth when published.

## Purpose and current baseline

Ironloom becomes a persistent, cost-conscious software factory and background harness service. Humans refine ideas, approve plans, configure a digital development team, and supervise delivery through a streaming web interface or native ChatGPT/Codex remote-host integration.

Local models are the intended orchestration path; frontier models initially come from OpenAI and Anthropic. Capable local open-weight models can fill coding roles instead. Every enabled role receives its model from a human configuration decision; no model is silently assigned or substituted.

The inspected Rust foundation provides typed contracts, a worker registry, gate execution, encrypted setup storage, and GitHub/SonarCloud adapters. It does not yet implement this factory. The supervisor dispatches one gate route, the queue defines lifecycle transitions without a persisted scheduler, worktrees have request validation rather than full lifecycle management, and the HTTP server serves setup and health synchronously. OpenAI credential fields are not model execution. The existing static software-generation demonstration writes templates rather than running coding models.

Remove Discord control and its thread-to-work-item binding requirement. Preserve useful contracts and package boundaries rather than rewriting the foundation wholesale.

## Human workflow and team

1. The human submits an idea.
2. Ironloom returns a refined concept and material questions.
3. Answers refine the concept; repeat until questions are exhausted or the human says enough.
4. Present a plan with scope, assumptions, tasks, dependencies, acceptance criteria, model assignments, budget, and permissions. Keep unanswered assumptions visible.
5. Record human approval against the specific plan revision and authorized scope.
6. Orchestrate workers to develop tests, implement, review, document, and complete the approved work. Repair loops remain within configured bounds.
7. Deliver according to the owner's instructions and configured publication, merge, and deployment permissions.

Authorized work proceeds without repeated permission requests. Material scope or authority changes return to the human. A genuine design flaw requires an explanation, recommendation, tradeoff, and decision before the affected design changes; implementation difficulty alone is not a design flaw.

| Concept | Responsibility |
| --- | --- |
| Role | Behavior instructions, responsibilities, permitted tools, and authority |
| Model profile | Provider, credentials, model ID, capabilities, reasoning settings, limits, and optional GPU binding |
| Assignment | A unit of planned work with its workspace, context, ownership, and expected outcome |
| Worker session | A role instance carrying out an assignment with focused context |
| Run and attempt | Execution history, including resumptions and retries |

Ship editable standard roles and a default team: product manager, planner, implementor, tester, reviewer, and documentation writer. The supervisor coordinates work and may use a configured orchestration role. Operators can customize roles and team composition.

Every enabled role, including shipped and orchestration roles, requires a human-selected model and explicit reasoning effort when applicable. The default team is incomplete until configured. Presets may simplify explicit selection; fallback models, billing changes, and substitutions require configuration rather than silent defaults.

Give workers the approved requirements and relevant task context, not every other worker's conversation. Reviewers receive independent context and direct access to changes. Local models propose assignments and transitions; deterministic Rust code enforces approvals, dependencies, policy, and budgets.

## Web service and setup

Ironloom owns authenticated configuration and interaction through a runtime web application, separate from the static public documentation site. Provide durable chat history, streamed messages and tool activity, worker progress, clarification questions, plan approval, follow-up steering, cancellation, pause/resume, and reconnection. Work continues when the browser disconnects. Reconnection restores state without repeating actions.

Serve a small first-time setup screen as the default landing page while setup is incomplete. This is a default route, not a restriction to that page: authenticated users can visit other available pages. Once setup is complete, the default page is a project dashboard ordered by most recent human interaction first. Persist the interaction timestamp with project metadata; background worker activity must not silently reorder that list.

Save setup progress and show every remaining required step with its status, reason, and direct action:

- Configure SQLite or PostgreSQL and verify infrastructure-configured persistent roots for models, the local database, and projects/Git. The local database root is unused with PostgreSQL. Missing infrastructure configuration links to deployment instructions rather than suggesting arbitrary browser-selected paths.
- Select enabled GPUs when local inference is selected.
- Connect chosen inference credentials and any model-source account needed for downloads.
- Assign models and applicable reasoning effort to each enabled role.
- Complete native remote-host connection setup when enabling that connection.

Requirements depend on configuration: OAuth-backed inference does not require an API key; remote-only inference does not require a GPU; public downloads do not require unnecessary source accounts. Preserve encrypted credentials, environment precedence, and existing setup-key protections. Do not expose secrets to browsers or worker prompts.

A previously configured project's unavailable folder is a project-level storage issue, not a reason to restart first-time setup. Health and configuration remain accessible while work is blocked.

Infrastructure health/readiness endpoints report actual service health and ability to serve web requests independently of assignment execution readiness. Incomplete team/model setup must not make an otherwise functioning web service unready or remove setup from Kubernetes Service traffic. Execution status separately reports unmet prerequisites and blocks affected assignments. Do not make unhealthy infrastructure report healthy merely to keep setup visible.

HTTP commands plus replayable server-sent events are a proposed web transport, not a final framework choice. Normalize provider events into Ironloom events rather than tying the UI to one provider.

## Native remote-host integration and authentication

Native ChatGPT/Codex remote-host integration is required: Ironloom conversations and work must be visible and controllable through native clients. An MCP plugin is not a substitute, and running Codex as the factory's coding worker is not the requested integration direction.

Investigate host enrollment, pairing, authentication refresh, session discovery/history, streaming, steering, questions/approvals, cancellation, reconnect, and client lifecycle expectations. Evaluate a thin protocol adapter around Ironloom's own session and execution state. Do not assume implementing app-server JSON-RPC alone establishes compatibility with the hosted relay and native clients.

Public app-server and remote-control sources provide a concrete investigation path. Acceptance of an independent multi-provider harness by those clients and services is still unverified. Pin the protocol/version used during qualification. Begin with deterministic responses and protocol tests, without inference. If compatibility requires an architectural change, return to the human instead of silently replacing native integration with plugin control.

In practical terms, two different things must work: signing into OpenAI, and making Ironloom appear as a connected host whose chats the native client can control. Published code describes the connection mechanism, but we have not yet demonstrated the second part with Ironloom. This is an unverified integration, not a finding that the requirement is impossible.

Remote-service sign-in also needs an explicit setup flow. If the browser is on a laptop and Ironloom runs on a server, a callback to `127.0.0.1` returns to the laptop, not the server. OpenAI's documented self-hosted flow completes sign-in locally and securely transfers the protected registration to the server, which manages subsequent refreshes. Evaluate that supported flow for onboarding without assuming a normal remote web callback is supported. This does not require an API key or change the human's OAuth inference choice.

OpenAI connection identity and inference authorization are separate configuration choices. Support:

- OAuth for native remote control only, with inference supplied separately.
- OAuth for native remote control and eligible account-backed inference, without requiring an API key.
- API-key inference independently of remote-control connection state.

OAuth inference follows the selected account's available models, permissions, and documented API limitations. Do not assume a remote-control token itself is an inference credential; use the supported authorization flow for each purpose. Do not silently switch between account usage and API-key billing. Anthropic BYOK and configured local inference remain independent options.

## Model access and sources

Provide OpenAI and Anthropic inference adapters first, plus best-effort support for configurable model endpoints. Detect capabilities where possible and allow explicit overrides. Adapt missing features where correctness permits, such as validating JSON when native structured output is unavailable. Reject only work that actually needs an unavailable capability; adaptations preserve authorization and make limitations visible.

Include these named model sources in discovery:

| Source | Integration scope |
| --- | --- |
| Hugging Face | Authentication, search, model/repository metadata, revisions, and downloads |
| ModelScope | Authentication, search, model/repository metadata, revisions, and downloads |
| Kaggle Models | Discovery, versions, downloads, and applicable account/license access |
| Alibaba / Qwen | Official publisher catalog and released weights through its official distribution repositories |
| Mistral | Official publisher catalog and released open-weight models |
| DeepSeek | Official publisher catalog and released open-weight models |

The three hubs and three publishers are all discoverable source choices. Preserve publisher identity separately from hosting location; follow official distribution links rather than inventing a standalone download API for every publisher. Source inclusion does not imply support for every architecture, hosted inference from that publisher, or unreleased weights. OpenAI and Anthropic remain the initial hosted inference integrations.

Use a common model-card and download UX, preserving source-specific credentials, access rules, licenses, and repository links. Show model card, architecture/format, revision, quantization/files, download size when available, access state, and GPU suitability. Support download progress, cancellation, recovery, and local inventory.

| Access state | Primary action |
| --- | --- |
| Accessible | Download |
| Authentication required | Connect the source account |
| Terms or access request required | Request access |
| Awaiting access approval | Check access |

Request access opens the repository page in the human's browser for manual completion. Check access again before enabling download. Keep the repository link available in every state and show denials or revoked access accurately.

Store downloaded weights in a separate, configurable root shared across projects. Reuse matching downloads while retaining source, license, revision, and checksum provenance. Project cleanup cannot remove shared models. Source SDK availability in Python does not authorize embedding Python.

## GPU discovery, execution, and model residency

Local inference execution and engine lifecycle belong to Ironloom. Discover GPUs visible to the service, display capabilities and memory, and let the operator enable one or more. Both roles and model profiles may bind to specific configured GPUs. Execution must satisfy both bindings; incompatible bindings are configuration errors, not permission to widen device access.

Restrict execution selection by engine support, architecture, format, quantization, device capabilities, context requirements, and memory. Allow browsing unsupported models with a visible explanation. On each model card show:

- Estimated supported: at least one available, configured GPU or supported GPU group appears sufficient.
- Not supported: a known hardware, engine, or memory constraint prevents execution.
- Unknown: metadata is insufficient for a reliable estimate.

Show the matching device/group and estimation assumptions. Include weight memory, runtime overhead, context/KV cache, and concurrent demand. Distinguish fit after unloading idle models from immediate availability. Refresh estimates when configuration changes. Multi-GPU execution requires support from the selected engine and hardware combination; summing memory alone is insufficient.

Without a supported GPU, Ironloom remains usable with explicitly configured remote inference. Do not silently replace local assignments or assume CPU inference fulfills the agreed GPU-backed path.

Prefer an embedded Rust engine. No engine is selected or qualified yet. Python embedding and any engine porting require Vanna's explicit approval when a concrete need is established; present the gap, recommendation, and tradeoff first. Neither is an automatic fallback. No local inference is authorized during this planning work.

Manage loaded models with LRU eviction constrained by active use and GPU placement:

1. Reuse an already-loaded compatible instance across roles when possible.
2. Keep idle models resident while memory permits.
3. Reserve capacity before admitting a load; avoid duplicate concurrent loads of the same instance.
4. Unload the least recently used eligible idle model when capacity is needed.
5. Never evict a model serving active inference requests. Once inference finishes, the loaded model is an ordinary LRU candidate even if its worker remains alive or is waiting for tools. Worker lifetime is not a residency lock. Respect bindings and multi-GPU placement.
6. Queue and explain requests when no safe eviction makes room; do not silently switch models.

Residency identity includes checkpoint, quantization, engine configuration, and placement. Unloading releases inference memory, not downloaded weights. Disk retention is a separate operator-controlled policy.

## Database, projects, assignments, and artifacts

Support configurable SQLite for local storage or PostgreSQL using an operator-provided connection string. The database owns organizational metadata: stable project IDs, mutable names, configured locations, conversations, plan revisions, approvals, assignments, lifecycle, and execution/usage records. GitHub remains authoritative for published specs, repository state, pull requests, reviews, checks, and merges; local caches cannot override fresh source-of-truth state.

Require separate infrastructure-configured persistent roots by storage type:

| Root | Contents and lifetime |
| --- | --- |
| Models | Shared downloaded model files, independent of project cleanup |
| Database | SQLite database and its associated files; unused when PostgreSQL is selected |
| Projects/Git | Complete project folders, backing Git repositories, assignment worktrees, and role artifacts |

Roots are configured through deployment/native-service configuration, not arbitrary worker or browser filesystem access. Persist the complete projects/Git root and model root across service or pod replacement; assignment worktrees cannot use disposable `emptyDir` storage. Keep organizational metadata and durable service/host identity outside the project root, using the selected database for those records. A missing projects mount must not hide project records or reset host identity. With PostgreSQL, do not silently create a local SQLite fallback.

Project listing must work from database records even when a project folder is unavailable. Show Storage unavailable, preserve metadata, and pause affected filesystem work. Do not recreate an empty project at a missing mount. Database migrations preserve IDs and references across supported backends.

Use the infrastructure-configured projects/Git root:

```text
<project-root>/<stable-project-id>/
  repository/
  worktrees/<assignment-id>/
  artifacts/<assignment-id>/<role>/<worker-id>/
  .ironloom/
```

Renaming a project does not move its directory. Run and attempt IDs remain execution metadata; assignment IDs align worktrees and role artifacts. Code, tests, and shipped documentation live in the worktree. Sibling artifact directories hold briefs, working material, and handoffs actually used by workers. Preserve required domain evidence; do not create redundant proof reports or verification bundles.

Only `ironloom-storage` accesses `.ironloom/` directly. It also owns persistence abstractions for database and managed artifact records; `ironloom-worktrees` owns Git workspace lifecycle. Keep database metadata and filesystem content responsibilities explicit, avoiding competing lifecycle authorities.

## Shared-worktree execution and cleanup

One worktree and branch belong to each assignment. Tester, implementor, documentation writer, and other roles can work concurrently in that same worktree; sequential roles reuse it. Do not split worktrees merely because worker roles differ.

Grant each worker explicit writable paths and an artifact area, with authorized read access to handoffs. Coordinate overlapping file changes through ownership handoff; boundaries may be individual files where tests and implementation are siblings. Path validation covers creation, edits, removal, moves, and path/symlink resolution.

Every shell command enters through Ironloom execution tools, which vet assignment identity, paths, working directory, environment, and allowed actions. Workers have no unrestricted alternative execution channel. Wrappers or symlinks may route compatible calls but cannot be the security boundary: enforce equivalent filesystem permissions on subprocesses and descendants, including legitimate build-output writes. Cancellation, timeout, and shutdown must clean up the owned process tree, not just the immediate child. Git index, branch, and commit mutations have one coordinated owner.

Review and test results identify the exact inspected content. A commit SHA alone is insufficient for a dirty shared worktree. Allow normal concurrent work, then pause worker edits to assignment source content during final validation and commit. Drain active mutations before validation; permit controlled validation output without allowing it to alter the content under review. Resume editing if corrections are needed and invalidate affected results after relevant edits. Keep the inspected content stable through the coordinated commit. Choose the smallest mechanism that provides this consistency without inventing a separate evidence framework.

The scheduler and worktree manager track active ownership and coordinate cleanup. Remove a worktree through Git only after workers release it and required changes are preserved. Keep interrupted/failed work according to configured retention. Never discard uncommitted work, unpublished commits, or needed artifacts without authorized disposal. Artifact retention is independent of worktree retention. Do not sweep unrelated directories or model storage.

## OpenTelemetry, usage, and cost control

Use OpenTelemetry traces, metrics, and correlated logs with configurable OTLP export. Apply standard semantic conventions where appropriate, version their adoption, and use `ironloom.*` attributes for product-specific dimensions.

| Context | Required information for applicable operations |
| --- | --- |
| Project | Stable project ID and mutable display name |
| Worker | Stable worker ID, configured role, and worker name |
| Model | `local` or `remote`, stable textual model ID, provider, selected reasoning effort where applicable |
| Model provenance | Revision, quantization, checkpoint hash; engine configuration and GPU placement for local execution |
| Execution | Assignment, task, run, and attempt IDs; trace/span correlation |
| Operation | Name, duration, success/failure/cancellation outcome, and redacted error details on failure |
| Usage | Input/output tokens, cache usage where available, reported/estimated status, cost and calculation basis |

Propagate context through scheduling, inference, tools, tests, review, and cleanup. Do not invent model identity for unrelated service work. Checkpoint hashes differ from repository revisions; retain file hashes through a manifest for sharded checkpoints. Hash or verify downloads/imports once rather than during every inference. Record unavailable hosted-model hashes honestly.

Use concise Rust instrumentation attributes and shared helpers, with explicit async/context propagation. Parent span linkage alone does not copy all required dimensions into child spans or metrics; attach them consistently. Do not automatically capture secrets or raw arguments. Include model load/reuse/eviction, GPU placement, and memory-related waiting in telemetry.

Track durable usage independently of collector availability and trace sampling, then export through OTel. Accounting makes no additional inference calls: use provider responses, engine counters, and deterministic calculations. Keep export asynchronous, use incremental accounting alongside existing state persistence, and avoid blocking workers on collectors or doing expensive per-operation scans. Minimize bookkeeping overhead without claiming it is literally zero.

Enforce configured budgets before dispatch, account for concurrent in-flight work, and distinguish estimates from reported usage. Account-backed OAuth usage must not be represented as API-key charges. Optimize accepted completed work, including retries and configured local compute estimates, rather than raw token count alone. Use focused context, bounded retries, configurable concurrency, and only explicitly configured escalation or fallback routes.

## Package ownership and migration

Retain the Rust composition service and strict public crate boundaries. Extend config for setup/team/model/device settings; core for shared typed identities; storage for database and managed records; policy for operator permissions and path authority; queue/process graph/supervisor for durable scheduling and approval transitions; workers for focused agent execution; worktrees for shared workspace lifecycle; and observability for OTel and usage context.

Separate model adapters, embedded inference, web transport, and native remote protocol concerns from business logic. Decide exact new crate boundaries with the implementation plan rather than preallocating a large package hierarchy. Domain decisions remain pure and directly testable.

Remove `ironloom-discord`, Discord credentials/setup/routes, thread-binding schemas and indexes, and Discord-specific CI/acceptance scripts and deployment fields as replacements land. Preserve needed historical records through explicit schema/migration handling. Conversation IDs used by chat and external protocols remain useful; they do not restore Discord binding as authorization.

Preserve GitHub refresh rules, SonarCloud normalization/bootstrap checks, runtime non-root packaging, Docker/Helm delivery, and public VitePress documentation. Support native macOS and native Linux operation as well as containerized deployment targeting Alpine. Keep shared orchestration/domain behavior independent of platform-specific GPU discovery, device access, inference-engine integration, and execution sandbox implementations. GPU families, CPU architectures, engine coverage, and the exact platform matrix still require qualification; do not assume identical GPU support across native and container deployments. Alpine remains a target, not permission to silently substitute another base image when integration is difficult.

Deployment instructions must configure the persistent roots by type and distinguish service readiness from execution readiness. Update affected English and all localized product docs with implementation changes. Planning updates do not claim these behaviors already ship.

## Proposed delivery sequence

| Stage | Outcome |
| --- | --- |
| 1. Native-host feasibility | Establish client/relay compatibility for Ironloom-owned sessions using deterministic protocol behavior; expose any architectural decision before implementation proceeds |
| 2. Durable service and setup | Database-backed identity/state, infrastructure-configured persistent roots, resumable setup and project dashboard, separate service/execution readiness, authenticated web chat/streaming, and replacement of Discord-specific coupling |
| 3. Team and inference configuration | Required model/effort assignments, OpenAI OAuth/BYOK and Anthropic BYOK, configurable endpoint support, source discovery/downloads, and GPU selection |
| 4. Local runtime and refinement | Qualify the approved Rust engine/hardware scope, GPU estimates and LRU residency; deliver concept/question iteration, versioned plans, and approval |
| 5. Complete assignment | Shared worktree with enforced worker paths and process-tree cleanup; tests, implementation, review, documentation, stable final validation/commit, configured delivery, and safe cleanup |
| 6. Operational completion | Cross-client resume/steering, concurrent assignments, recovery, retention, OTel correlation, and budget behavior across supported configurations |

Storage, permissions, telemetry, and usage accounting accompany the stages that introduce operations; they are not postponed until the last stage. This sequence is proposed, not authorization to implement.

Use focused functional regression tests and existing gates for approval revision handling, streaming reconnect without repeated execution, shared-worktree path enforcement, stable validation state, database/backend behavior, missing storage, source-access transitions, GPU placement/LRU active-use protection, model capability adaptation, and usage accounting. Preserve all existing formatting, Clippy, test, schema, policy, audit, docs, Docker, Helm, and SonarCloud requirements. Do not create proof packages, independent auditors, saved test transcripts, or bespoke evidence generators.

## Remaining decisions

- Native macOS, native Linux, and Alpine container deployment are required. Supported OS versions, CPU architectures, GPU families, and engine/backend combinations remain to be selected and qualified.
- Native client/relay compatibility and the exact protocol adapter, including any upstream support needed.
- Rust inference engine selection and supported model architectures/formats. Python embedding and engine porting each require Vanna's explicit approval if proposed.
- First-release operator/account topology and default delivery authority. A single-owner deployment and delivery to a reviewed pull request were proposals, not accepted constraints.
- Concrete web transport/framework, execution sandbox mechanisms per supported OS, database schema/migration details, and deployment packaging belong in the implementation plan.

## Integration references

These references inform feasibility; they do not establish implemented or qualified behavior. Recheck version-sensitive contracts during implementation.

- [App-server protocol](https://learn.chatgpt.com/docs/app-server) and [native remote transport source](https://github.com/openai/codex/tree/main/codex-rs/app-server-transport/src/transport/remote_control).
- [OpenAI OAuth inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- [OpenAI self-hosted OAuth setup](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).
- [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).
- [Hugging Face model access](https://huggingface.co/docs/hub/models-gated), [ModelScope](https://github.com/modelscope/modelscope_hub), and [Kaggle Models](https://www.kaggle.com/docs/models).
- [Alibaba/Qwen official releases](https://qwen.ai/), [Mistral model catalog](https://docs.mistral.ai/), and [DeepSeek official repositories](https://github.com/deepseek-ai).
- [Rust engine candidate: mistral.rs](https://github.com/EricLBuehler/mistral.rs).
- [Rust instrumentation](https://docs.rs/tracing/latest/tracing/attr.instrument.html) and [OpenTelemetry context integration](https://docs.rs/tracing-opentelemetry/latest/tracing_opentelemetry/trait.OpenTelemetrySpanExt.html).

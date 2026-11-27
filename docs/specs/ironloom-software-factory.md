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
4. Present a plan with scope, assumptions, tasks, dependencies, acceptance criteria, model assignments, optional budget limits, and permissions. Keep unanswered assumptions visible.
5. Record human approval against the specific plan revision and authorized scope.
6. Orchestrate workers to develop tests, implement, review, document, and complete the approved work. Repair loops remain within configured bounds.
7. Deliver according to the owner's instructions and configured publication, merge, and deployment permissions.

Propose permission to push a branch and open a pull request, with operator approval for merge and deployment, as the shipped delivery mode. Setup must show this selection and obtain explicit human confirmation or a different configured mode before execution is ready; presenting a default is not consent. Operators can later configure different delivery authority. Planning merge order does not itself grant permission to merge into a protected delivery branch or deploy.

Authorized work proceeds without repeated permission requests. Material scope or authority changes return to the human. A genuine design flaw requires an explanation, recommendation, tradeoff, and decision before the affected design changes; implementation difficulty alone is not a design flaw.

| Concept | Responsibility |
| --- | --- |
| Role | Behavior instructions, responsibilities, permitted tools, and authority |
| Model profile | Provider, credentials, model ID, capabilities, reasoning settings, limits, and optional GPU binding |
| Assignment | A unit of planned work with its workspace, context, ownership, and expected outcome |
| Worker session | A role instance carrying out an assignment with focused context |
| Run and attempt | Execution history, including resumptions and retries |

Ship editable standard roles and a default team: product manager, planner, implementor, tester, reviewer, and documentation writer. The supervisor coordinates work and may use a configured orchestration role. Operators can customize roles and team composition.

Role instructions own workflow judgment: task decomposition, collaboration, handoffs, repair strategy, and planner/implementor decisions about integration. Ship the agreed team behavior as editable role instructions rather than hardcoding every workflow choice into the runtime. Deterministic service code enforces approved scope, permissions, required gates, resource limits, and execution consistency. Role instructions cannot bypass those boundaries.

When instructions do not cover a decision, conflict, or leave the worker at all unsure, ask the operator before proceeding with the affected decision. Explain the uncertainty concisely and propose a choice when possible. Independent authorized work may continue. An existing clear, applicable instruction or authorization should not trigger repeated permission requests.

Every enabled role, including shipped and orchestration roles, requires a human-selected model and explicit reasoning effort when applicable. The default team is incomplete until configured. Presets may simplify explicit selection; fallback models, billing changes, and substitutions require configuration rather than silent defaults.

Give workers the approved requirements and relevant task context, not every other worker's conversation. Reviewers receive independent context and direct access to changes. Local models propose assignments and transitions; deterministic Rust code enforces approvals, dependencies, policy, and budgets.

Copy effective instructions into each workflow-run/assignment's own storage at creation; active work reads that copy rather than a mutable global template. When the human edits instructions, ask whether to apply the change to running workflows/tasks. No leaves their copies and behavior unchanged; the revised template applies to new work. Yes updates the selected active copies and notifies each affected workflow to reload its instructions and propagate the change to its workers. Track the applied revision and acknowledgment so a pending update is visible; workers use the new instructions at their next controllable execution boundary. Do not pretend an already-running inference call has consumed revised instructions. This choice does not expand approved scope or override permission revocation.

Remember every operator question and answer durably with its original wording, source conversation, answering operator, time, and applicable project/assignment or explicitly broader scope. Make these decisions available to relevant authorized roles and across web/native clients through the existing conversation and database records. Preserve corrections and identify which answer supersedes an earlier one; do not silently turn a task-specific answer into a global instruction.

Before asking a similar question, consult applicable prior answers. Remind the operator of the previous choice and propose reusing it, noting any changed context: "Last time, you chose X for Y. Use that here too?" Similarity alone is not fresh approval. Follow a clear standing instruction within its scope without asking again; otherwise request confirmation when applicability is uncertain. Answers guide the current work, but promoting one into a shared role template remains an explicit instruction change and follows the active-work update choice above.

## Web service and setup

Ironloom owns authenticated configuration and interaction through a runtime web application, separate from the static public documentation site. Provide durable chat history, streamed messages and tool activity, worker progress, clarification questions, plan approval, follow-up steering, cancellation, pause/resume, and reconnection. Work continues when the browser disconnects. Client reconnection restores persisted state without itself resubmitting work; web and native clients share execution state.

Support multiple human accounts from the first release, with both Ironloom-managed login and external OpenID Connect login. The first authenticated user to successfully redeem the initial setup token becomes the sole initial administrator. Establish that account and consume the token atomically so concurrent attempts cannot create multiple bootstrap administrators. The token expires upon redemption and cannot be reused or replaced by newly minted administrator tokens; this is a one-time installation operation. Persist completion across restarts, and never reopen bootstrap after a storage/authentication error or because the original token remains in infrastructure configuration. The established administrator assigns permissions to other users. Successful local/OIDC login alone grants no administrator authority.

Keep service login separate from provider inference credentials. Define project access and approval authority explicitly, and map native-client actions to an authorized human account rather than treating a connected host as unrestricted authority. Evaluate OpenFGA for fine-grained permissions covering humans, worker identities, projects, assignments, files, credentials, conversations, and other identified resources. OpenFGA adoption and packaging remain proposed, not selected. Resource authorization must still be enforced by service tools and OS sandboxes; a relationship check alone cannot constrain a subprocess.

Use Flutter/Dart for the operator UI, with web delivery first and a shared client architecture for later desktop/mobile applications. The web client derives its API/connection base from its serving web address, including the configured deployment path. Future native clients require a server address and keep authentication scoped to that connection. Keep Rust service/domain logic and the public VitePress documentation separate from the Flutter client. Desktop/mobile packaging is future scope, not an added first-release deliverable. Streaming, authentication, text selection/copy, keyboard use, accessibility, and reconnect must work through the shared client boundary without assuming browser-only APIs.

Graceful shutdown stops new dispatch and persists current work state. Handle SIGINT, SIGTERM, and other catchable shutdown requests with best-effort persistence and owned-process cleanup within the available shutdown time. Forced termination, a crash, or power loss may prevent any final write: resume from the latest durable state, accepting that recent or active inference may need to run again. Do not promise exactly-once inference or persistence after an uncatchable termination. Reconcile uncertain external mutations before retrying them; repeating inference does not authorize blindly repeating a merge, publication, or deployment.

Serve a small first-time setup screen as the default landing page while setup is incomplete. This is a default route, not a restriction to that page: authenticated users can visit other available pages. Once setup is complete, the default page is a project dashboard ordered by most recent human interaction first. Persist the interaction timestamp with project metadata; background worker activity must not silently reorder that list.

Save setup progress and show every remaining required step with its status, reason, and direct action:

- Configure SQLite or PostgreSQL and verify infrastructure-configured persistent roots for models, the local database, and projects/Git. The local database root is unused with PostgreSQL. Missing infrastructure configuration links to deployment instructions rather than suggesting arbitrary browser-selected paths.
- Select enabled GPUs when local inference is selected.
- Connect chosen inference credentials and any model-source account needed for downloads.
- Assign models and applicable reasoning effort to each enabled role.
- Confirm the proposed delivery mode or explicitly choose another permitted mode.
- Complete native remote-host connection setup when enabling that connection.

Requirements depend on configuration: OAuth-backed inference does not require an API key; remote-only inference does not require a GPU; public downloads do not require unnecessary source accounts. Preserve encrypted credentials, environment precedence, and existing setup-key protections. Do not expose secrets to browsers or worker prompts.

Startup must positively identify missing or incomplete configuration and present setup with the required completion or correction actions. Distinguish that state from unavailable storage, corrupt configuration, or decryption failure; show the actual problem without resetting identity or overwriting existing setup. Database connection settings and encryption-key access must be available before opening the selected database. Keep setup/correction guidance reachable when the web service can operate, without misreporting failed infrastructure as healthy.

A previously configured project's unavailable folder is a project-level storage issue, not a reason to restart first-time setup. Health and configuration remain accessible while work is blocked.

Infrastructure health/readiness endpoints report actual service health and ability to serve web requests independently of assignment execution readiness. Incomplete team/model setup must not make an otherwise functioning web service unready or remove setup from Kubernetes Service traffic. Execution status separately reports unmet prerequisites and blocks affected assignments. Do not make unhealthy infrastructure report healthy merely to keep setup visible.

HTTP commands plus replayable server-sent events are a proposed web transport, not a final framework choice. Normalize provider events into Ironloom events rather than tying the UI to one provider.

## Native remote-host integration and authentication

Native ChatGPT/Codex remote-host integration is required: Ironloom conversations and work must be visible and controllable through native clients. An MCP plugin is not a substitute, and running Codex as the factory's coding worker is not the requested integration direction.

Investigate host enrollment, pairing, authentication refresh, session discovery/history, streaming, steering, questions/approvals, cancellation, reconnect, and client lifecycle expectations. Evaluate a thin protocol adapter around Ironloom's own session and execution state. Do not assume implementing app-server JSON-RPC alone establishes compatibility with the hosted relay and native clients.

Native remote-host support already exists: Vanna runs multiple Codex services on VMs connected to Codex Desktop. Treat that working setup as the integration reference. The remaining investigation is how Ironloom implements the existing connection and exposes its own sessions and multi-provider execution through it; general remote-host feasibility is not an open question.

Use the public app-server and remote-control sources to identify reusable components and map Ironloom's session lifecycle to the existing protocol. Pin the protocol/version used during qualification. Begin with deterministic responses and protocol tests, without inference. Verify Ironloom-specific compatibility in each required client; the working Codex Desktop setup does not itself qualify Ironloom or other clients. If implementation reveals an actual architectural flaw, return to the human instead of silently replacing native integration with plugin control.

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

Build dynamic discovery/install filters from the supported engine/version and backend capability matrix, model architecture/configuration, weight format and quantization, tokenizer/chat-template support, required features, and configured devices. Compatibility is a product capability required during primary build-out, not a fixed list of role models selected during testing. Show which available engine can run each model and why a choice is unsupported or unknown; a matching file extension or enough memory alone is insufficient. Refresh these decisions when engines, devices, or model profiles change. Keep access/license state, engine compatibility, estimated memory fit, and actual backend qualification distinct. Exact role selections and context/memory limits remain operator configuration.

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

Prefer an embedded Rust engine. No engine set is selected or qualified yet; compare complementary engines rather than assuming one engine must cover every model. Python embedding and any engine porting require Vanna's explicit approval when a concrete need is established; present the gap, recommendation, and tradeoff first. Neither is an automatic fallback. No local inference is authorized during this planning work.

Design the engine boundary to allow more than one enabled engine if selected. Model profiles identify their chosen compatible engine/version and backend; do not silently change engines as a fallback. Ironloom coordinates device reservations, active-use protection, and LRU residency across engines so independent allocators cannot each assume the same memory is free. Include engine identity/version in local model provenance and telemetry. Any managed helper remains under Ironloom lifecycle control; it must not expose an alternative worker execution channel.

Manage loaded models with LRU eviction constrained by active use and GPU placement:

1. Reuse an already-loaded compatible instance across roles when possible.
2. Keep idle models resident while memory permits.
3. Reserve capacity before admitting a load; avoid duplicate concurrent loads of the same instance.
4. Unload the least recently used eligible idle model when capacity is needed.
5. Never evict a model serving active inference requests. Once inference finishes, the loaded model is an ordinary LRU candidate even if its worker remains alive or is waiting for tools. Worker lifetime is not a residency lock. Respect bindings and multi-GPU placement.
6. Queue and explain requests when no safe eviction makes room; do not silently switch models.

Residency identity includes checkpoint, quantization, engine configuration, and placement. Unloading releases inference memory, not downloaded weights. Disk retention is a separate operator-controlled policy.

## Database, projects, assignments, and artifacts

Support configurable SQLite for local storage or PostgreSQL using an operator-provided connection string. The database owns organizational metadata: stable project IDs, mutable names, configured locations, conversations, operator questions/answers and their scope, plan revisions, approvals, assignments, lifecycle, and execution/usage records. GitHub remains authoritative for published specs, repository state, pull requests, reviews, checks, and merges; local caches cannot override fresh source-of-truth state.

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
  artifacts/<assignment-id>/instructions/
  artifacts/<assignment-id>/<role>/<worker-id>/
  .ironloom/
```

Renaming a project does not move its directory. Run and attempt IDs remain execution metadata; assignment IDs align worktrees and role artifacts. Code, tests, and shipped documentation live in the worktree. Sibling artifact directories hold assignment instruction copies, briefs, working material, and handoffs actually used by workers. The assignment instructions directory is managed through the service's instruction-update flow, not freely writable by workers. Preserve required domain evidence; do not create redundant proof reports or verification bundles.

Only `ironloom-storage` accesses `.ironloom/` directly. It also owns persistence abstractions for database and managed artifact records; `ironloom-worktrees` owns Git workspace lifecycle. Keep database metadata and filesystem content responsibilities explicit, avoiding competing lifecycle authorities.

## Shared-worktree execution and cleanup

One worktree and branch belong to each assignment. Tester, implementor, documentation writer, and other roles can work concurrently in that same worktree; sequential roles reuse it. Do not split worktrees merely because worker roles differ.

Grant each worker explicit writable paths and an artifact area, with authorized read access to handoffs. Coordinate overlapping file changes through ownership handoff; boundaries may be individual files where tests and implementation are siblings. Path validation covers creation, edits, removal, moves, and path/symlink resolution.

Every shell command enters through Ironloom execution tools, which vet assignment identity, paths, working directory, environment, and allowed actions. Workers have no unrestricted alternative execution channel. Wrappers or symlinks may route compatible calls but cannot be the security boundary: enforce equivalent filesystem permissions on subprocesses and descendants, including legitimate build-output writes. Handled cancellation, timeout, and shutdown clean up the owned process tree, not just the immediate child; recovery checks for surviving owned processes after an abrupt termination. Git index, branch, and commit mutations have one coordinated owner at a time for the affected Git state.

The planner decides merge order with the implementors, accounting for assignment starting revisions and dependencies. Each implementor performs its own merge through the controlled tools, resolves its merge conflicts, runs final integrated tests against the combined result, and makes the changes needed for passing tests before reporting its merge complete. The runtime enforces the planned order and coordinates conflicting Git mutations; it does not take the planner's integration decisions or the implementor's merge responsibility. Existing review, quality gates, and owner delivery permissions still apply.

Review and test results identify the exact inspected content. A commit SHA alone is insufficient for a dirty shared worktree. Allow normal concurrent work, then pause worker edits to assignment source content during final validation and commit. Drain active mutations before validation; permit controlled validation output without allowing it to alter the content under review. Resume editing if corrections are needed and invalidate affected results after relevant edits. Keep the inspected content stable through the coordinated commit. Choose the smallest mechanism that provides this consistency without inventing a separate evidence framework.

The scheduler and worktree manager track active ownership and coordinate cleanup. Remove a worktree through Git only after workers release it and required changes are preserved. Keep interrupted/failed work according to configured retention. Never discard uncommitted work, unpublished commits, or needed artifacts without authorized disposal. Artifact retention is independent of worktree retention. Do not sweep unrelated directories or model storage.

## Streaming and generation control

Prefer streaming across command execution, inference adapters, and operator events, especially local inference when the engine/model supports it. Drain command stdout and stderr continuously with bounded buffering rather than waiting for process exit. Slow or disconnected viewers must not stop process output consumption or inference monitoring. Make non-streaming provider/engine limitations visible.

Observe generated output incrementally to detect runaway generation and repeated loops without additional inference calls. Use bounded, configurable generation limits and repetition monitoring; repetition is a signal, not proof that legitimate repetitive code is wrong. Stop or interrupt according to configured policy, report the reason, and retain available output and usage. Where streaming is unavailable, retain the supported request limits and cancellation controls without claiming live loop detection. Monetary budgets being disabled does not disable generation controls.

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

Budget limits are optional and editable at any time, including during active work; operators may enable, raise, lower, or disable them without creating a new plan revision solely for that edit. Continue usage tracking when limits are disabled. Apply the current limits before subsequent dispatch and account for concurrent in-flight work; lowering a limit cannot undo incurred charges or guarantee immediate cessation of an already-dispatched request. Show outstanding usage/reservations when a limit changes. Missing usage after interruption remains unknown or estimated, not zero. Account-backed OAuth usage must not be represented as API-key charges. Optimize accepted completed work, including retries and configured local compute estimates, rather than raw token count alone. Use focused context, bounded retries, configurable concurrency, and only explicitly configured escalation or fallback routes.

## Package ownership and migration

Retain the Rust composition service and strict public crate boundaries. Extend config for setup/team/model/device settings; core for shared typed identities; storage for database and managed records; policy for operator permissions and path authority; queue/process graph/supervisor for durable scheduling and approval transitions; workers for focused agent execution; worktrees for shared workspace lifecycle; and observability for OTel and usage context.

Separate model adapters, embedded inference, web transport, and native remote protocol concerns from business logic. Decide exact new crate boundaries with the implementation plan rather than preallocating a large package hierarchy. Domain decisions remain pure and directly testable.

Remove `ironloom-discord`, Discord credentials/setup/routes, thread-binding schemas and indexes, and Discord-specific CI/acceptance scripts and deployment fields as replacements land. Preserve needed historical records through explicit schema/migration handling. Conversation IDs used by chat and external protocols remain useful; they do not restore Discord binding as authorization.

Preserve GitHub refresh rules, SonarCloud normalization/bootstrap checks, runtime non-root packaging, Docker/Helm delivery, and public VitePress documentation. Support native macOS and native Linux operation as well as containerized deployment targeting Alpine. Keep shared orchestration/domain behavior independent of platform-specific GPU discovery, device access, inference-engine integration, and execution sandbox implementations. GPU families, CPU architectures, engine coverage, and the exact platform matrix still require qualification; do not assume identical GPU support across native and container deployments. Alpine remains a target, not permission to silently substitute another base image when integration is difficult.

Linux/Alpine GPU backends may be included in the first release as explicitly unqualified until tested on the corresponding hardware. Compilation, simulated devices, and Mac inference do not establish Linux GPU qualification. Distinguish backend qualification status from model memory-fit estimates in the UX; do not label an untested backend as verified support. Native service operation and applicable non-inference checks still need validation on each target.

Deployment instructions must configure the persistent roots by type and distinguish service readiness from execution readiness. Update affected English and all localized product docs with implementation changes. Planning updates do not claim these behaviors already ship.

## Build-out on Cinder and Ivy, then inference on the Mac

The agreed delivery split is primary build-out without inference runs on Cinder and Ivy, followed by combined integration and final inference work on the Mac. This describes how to build Ironloom, not a distributed-host architecture for the product. The work allocation below is proposed; implementation and dispatch are not authorized by this planning document.

### 1. Shared contracts before parallel implementation

Resolve the decisions required for the affected work below and establish one shared baseline. Cinder owns common domain/storage/service contracts; Ivy owns transport/provider mapping against them. Agree exact new module/crate paths before concurrent edits. Define operator/project authority, plan and instruction revisions, assignment/worker lifecycle, persisted commands and replayable events, streaming inference/tool requests, cancellation, usage, and GPU-engine lifecycle through public Rust contracts and their schemas. Choose database migrations and the web transport once; do not let each lane invent its own session or approval model.

Map the existing native-host protocol to these contracts early, using deterministic responses and the working VM setup as the reference. Check session visibility, input, questions/approvals, cancellation, and reconnect without model calls. If the upstream transport imposes a constraint on the shared contracts, resolve it before dependent work is split. This does not reopen whether native remote hosts exist.

### 2. Primary build-out: no Ironloom inference runs

Use scripted model responses, simulated engine/device events, and provider HTTP fixtures. No local or hosted generation, embedding calls, model warm-up, or inference-based capability probes may run through Ironloom or its tests in this phase. This restriction concerns the software under development; it does not prohibit the coding agents on Cinder and Ivy from using their configured models to implement it. Build real adapters and engine integration where selected, but keep inference execution out of startup, ordinary tests, and CI. Do not treat simulations as model qualification.

| Proposed owner | Owned work and existing paths | Dependency and handoff |
| --- | --- | --- |
| Cinder: service and execution | `crates/ironloom-{core,config,storage,policy,queue,process-graph,supervisor,workers,worktrees,gates,observability,schemas}`; runtime composition; workspace Cargo manifests/lockfile; Docker/Helm and CI | SQLite/PostgreSQL, multi-user authorization, durable lifecycle/recovery, copied instructions and remembered answers, editable standard roles, controlled tools/shared worktrees, merge coordination, streaming commands, OTel/accounting, and persistent deployment. Export service interfaces for Ivy; integrate adapter wiring after its implementation lands. |
| Ivy: operator UX and adapters | New Flutter operator app and web/native/model adapter modules, with exact paths agreed in the shared baseline; their package manifests, tests, and schemas | Local/OIDC login UI and transport, setup/dashboard/streaming chat, team/model/source/device/budget controls, native remote-host transport, OpenAI/Anthropic/configurable endpoint adapters, source discovery/downloads with dynamic compatibility filters, and engine/GPU integration with simulated LRU behavior. Use Cinder's service/policy/storage interfaces; keep business decisions out of transport code. |

Each owner writes the focused tests for its behavior. Cinder owns shared runtime wiring and root manifests so both lanes do not overwrite them; Ivy supplies its integration requirements through the agreed contracts. Assign affected English/localized documentation files to one owner per change or hand them off sequentially. Discord removal spans both lanes and is completed in the combined build, including contracts, setup, deployment, scripts, and active documentation.

Use dedicated Ironloom checkouts on the two hosts, based on the same published planning/contracts baseline. Do not repurpose their other active project checkouts. Remote Ironloom checkouts and toolchains still need preparation; they were not present in the app's project inventory during this review. Each implementor integrates in the agreed order, repairs its conflicts, and reruns affected combined checks. Do not dispatch both lanes against unpublished or differing contracts.

Primary build-out exercises real database operations, Git worktrees, filesystem/command enforcement, streaming/reconnect, multi-user permissions, shutdown/recovery, instruction updates, remembered answers, usage accounting, and both adapters together with deterministic responses. Include scripted idea-to-questions-to-approved-plan-to-delivery scenarios. Existing formatting, Clippy, test, schema, policy, audit, docs, Docker, Helm, and SonarCloud checks remain required; preserve their purpose while replacing Discord-specific cases.

### 3. Combine on the Mac without inference first

Bring both lanes onto one integration revision. Resolve wiring and platform issues, run the applicable existing checks, exercise native macOS process/filesystem enforcement, and connect the native client to the real service using deterministic responses. Verify the UI, persistence, workflow, tools, model adapters, and telemetry work together before loading models. Keep Linux/Alpine backend qualification status explicit.

### 4. Final inference work on the Mac

After explicit authorization for this phase, use the selected engine set and human-configured role models/effort to run real local and configured frontier inference from the Mac. Verify streaming/tool calling, refinement and clarification, approved work with concurrent roles, integrated tests/review/docs, interruption/recovery, LRU load/reuse/eviction, generation controls, and usage/accounting. Tune instructions and model settings through the operator-controlled update flow. Keep Python embedding and engine porting subject to Vanna's explicit approval.

The current Mac reports Apple M5 Max, 128 GiB memory, arm64, and macOS 27.2.1. This is a qualification host, not a declared minimum platform or proof that any particular model fits. Select exact model revisions, quantizations, context sizes, concurrency, and working-memory allowance before live runs. Real inference and any related fixes are part of this final phase, not implied by passing deterministic tests. Mac qualification does not qualify Linux/Alpine GPU execution.

Storage, permissions, instruction updates, shutdown/recovery, streaming controls, telemetry, and optional budget enforcement accompany the operations that need them; they are not deferred to inference qualification.

Use focused functional regression tests and existing gates for approval revision handling, streaming reconnect without repeated execution, shared-worktree path enforcement, stable validation state, database/backend behavior, missing storage, source-access transitions, GPU placement/LRU active-use protection, model capability adaptation, and usage accounting. Preserve all existing formatting, Clippy, test, schema, policy, audit, docs, Docker, Helm, and SonarCloud requirements. Do not create proof packages, independent auditors, saved test transcripts, or bespoke evidence generators.

## Remaining decisions before implementation

Settled: multiple human accounts; local login and OIDC; one-time token redemption establishes the sole initial administrator, with no replacement admin tokens; delivery mode explicitly confirmed during setup; Flutter web UI with future native clients using a server address; native macOS/Linux and Alpine targets; untested Linux/Alpine GPU backends may ship explicitly unqualified; no Ironloom inference runs during Cinder/Ivy build-out; final inference work on the Mac. Engine-driven model discovery filters belong in primary build-out; actual role/model settings remain operator configuration.

| Decision | Recommendation or required resolution | Needed before |
| --- | --- | --- |
| Resource authorization and sharing | Choose OpenFGA or the embedded alternative below, including deployment/storage and grant enforcement. Define project/file/agent permissions, administrator visibility, credential sharing, and cross-project answer reuse. Creator-owned projects, explicit membership, and private credentials unless deliberately shared remain proposed defaults. | Authorization/database contracts |
| Service/database stack and public contracts | Flutter is selected for the operator UI. Tokio/Axum, HTTP commands plus replayable SSE, and SQLx-backed SQLite/PostgreSQL remain proposed. Fix exact adapter boundaries, identity mapping, schema/migrations, event/request semantics, and dependency versions once. | Parallel build-out |
| Native protocol integration | Select and pin the upstream transport/components or compatible adapter after inspecting their actual interfaces; map native identities and sessions to Ironloom's multi-user service. Resolve missing upstream support without substituting plugin control. | Dependent session/auth implementation |
| Platform enforcement and build matrix | Choose minimum OS versions/architectures and concrete command/filesystem sandbox mechanisms for macOS, Linux, and Alpine. Prove enforcement with ordinary processes, without inference. Target-specific dependencies must preserve the existing Rust/CI gates. | Execution and deployment implementation |
| Engine set and backend scope | Choose the initial engines from the options below, pin versions, and define format/architecture/device capabilities for discovery filters. Rust SDK availability is not proof of Alpine compatibility. Python/porting still require approval. | Concrete engine drivers and model compatibility catalog; interfaces can use simulated engines |
| Live-run configuration | Human-selected role models and reasoning effort, exact local weights/revisions/quantization, memory/context/concurrency and generation controls, credentials, project, and any optional budget. The configuration/validation UX and dynamic engine filters are implemented earlier. | Actual Mac inference runs |

Do not turn implementation choices into additional operator workflow rules. The planner and implementors retain the agreed role-level judgment; resolve shared technical interfaces before dividing work, and ask the operator when instructions leave uncertainty.

## Options awaiting selection

These are source-informed recommendations, not approved dependencies or measured performance results. No models were run for this comparison.

### Resource authorization

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| OpenFGA, bundled and service-managed (recommended for the requested resource graph) | Relationship-based grants and inheritance can cover humans/agents and project, folder, file, or other resource identities. PostgreSQL and SQLite storage options align with the deployment choices. | A separate service/process, API boundary, authorization-model migrations, and availability/revocation behavior to manage. It is not an embedded Rust library. |
| Embedded Cedar in `ironloom-policy` | Rust policy evaluation without another service; schema-validated policies and resource/principal attributes. | Ironloom must own relationship/entity loading, persistence, permission-listing behavior, and the administration UX. It is not a drop-in OpenFGA implementation. |

For OpenFGA, propose a managed local process on native installations and a chart-managed service/container for Kubernetes, with authorization storage under the database root for SQLite or separately owned PostgreSQL storage. No fourth persistent root or SQLite fallback in PostgreSQL mode. Treat OpenFGA as the grant authority, not a second independent copy of application grants; define how bootstrap completion and grant initialization recover from interruption without minting another token. Model worker identities and their delegated limits explicitly. Project/folder inheritance can reduce per-file grants, but tools must still resolve and enforce the actual file/resource boundary. Authorization failure must not become unrestricted execution. Sources: [OpenFGA relationship model](https://openfga.dev/docs/modeling/parent-child), [storage configuration](https://openfga.dev/docs/getting-started/setup-openfga/configuration), [Cedar](https://github.com/cedar-policy/cedar).

### Native remote-host transport

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| Adapt pinned upstream Rust transport/protocol components (recommended starting point) | Reuses the existing enrollment/relay and wire behavior while Ironloom owns sessions and execution. | Upstream auth/state dependencies need deliberate integration. Current `start_remote_control` requires `StateRuntime`, whose persistence is SQLite; unchanged reuse conflicts with our PostgreSQL-only storage option. Adapt that boundary rather than silently introducing local SQLite. |
| Implement a dedicated compatible transport using upstream protocol types/tests as the reference | Direct control of Ironloom identity, database, lifecycle, and dependency boundaries. | More protocol work and ongoing compatibility maintenance; native client/relay behavior must be exercised explicitly. |

The reviewed upstream revision is `e2e7dabd4587c7b0fbf934e6a93b6cec8245751d`. This is a concrete dependency tradeoff, not uncertainty that native remote hosts exist. No implementation of the conflicting persistence path is authorized. Sources: [transport entrypoint](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/app-server-transport/src/transport/remote_control/controller.rs#L266), [state implementation](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/state/src/runtime.rs#L102).

### Execution sandbox and platform baseline

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| Native platform sandboxes: Seatbelt on macOS; bubblewrap plus seccomp on Linux/Alpine (recommended starting point) | Fits native operation, shared worktrees, and constrained subprocesses without a mandatory VM. Reuse reviewed upstream primitives where practical. | Seatbelt's interface is deprecated/poorly documented. Linux namespaces and container runtime policy must permit the required sandbox; a container image alone does not establish that. |
| VM/container-isolated execution | Separate execution environments and stronger separation from host services. | More lifecycle/storage plumbing; a Linux VM cannot validate native macOS builds, and per-role path enforcement is still required inside a shared assignment. Not a replacement for the selected native service targets. |

Proposed initial qualification targets: Apple Silicon macOS 14+; Linux x86-64/arm64 with kernel 6.6+ and the required namespace/seccomp capabilities; Alpine 3.24 containers on such a host. These are candidates to approve and validate, not established minimums guaranteed by an engine or UI framework. Broader older-platform support adds testing without resolving the immediate build-out. Keep server/sandbox support separate from future Flutter desktop/mobile platform coverage. Never run a worker unsandboxed because required features are missing. Sources: [upstream sandbox design](https://openai.com/index/inside-the-codex-sandbox/), [bubblewrap](https://github.com/containers/bubblewrap), [Flutter platform coverage](https://docs.flutter.dev/reference/supported-platforms).

### Inference engines

| Engine | Strengths for Ironloom | Main cost or limitation |
| --- | --- | --- |
| mistral.rs | Rust embedding; Metal/CUDA, batching, paged attention, quantization, and multiple model architectures. Best first candidate for the Rust preference. | Model/format/backend support remains version-specific; Alpine and exact hardware need qualification. Built-in agent/tool execution must not bypass Ironloom tools. |
| llama.cpp | Broad GGUF ecosystem and hardware backends including Metal, CUDA, HIP, and Vulkan; useful complementary coverage. | C/C++, requiring a maintained safe binding or a service-owned helper and native build packaging. GGUF support does not mean every architecture works. |
| MLX Swift LM / MLX-LM | Apple Silicon-focused option with quantized models and streaming; Swift offers a route without embedding Python. | Apple-specific integration and a Swift/native bridge or managed helper. The Python MLX-LM route needs explicit Python approval. Swift and Python model support must be checked separately. |
| vLLM | Server-oriented batching, cache management, distributed execution, and broad model/tool-serving features; candidate for high-concurrency Linux GPUs. | Python/PyTorch and GPU packaging are a larger fit change for the Rust/Alpine design. Do not adopt a managed Python runtime without an explicit decision; an operator-managed compatible endpoint is a separate existing option. |
| Candle directly | Rust model/tensor framework with GPU support and detailed control. | More model, decoding, batching, and serving integration to own; not the smallest route to broad factory support. |

Recommendation: begin by selecting and qualifying mistral.rs plus llama.cpp as complementary engines, with shared memory/LRU control; retain MLX Swift as an Apple-specific option if it demonstrates a needed advantage. Keep vLLM as an endpoint option unless managed Python integration is explicitly approved. Actual latency, throughput, and memory efficiency depend on the selected model, quantization, context, and concurrency; source feature lists cannot rank speed on this Mac. Compare those during the authorized inference phase. Sources: [mistral.rs](https://github.com/EricLBuehler/mistral.rs), [llama.cpp backends](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [MLX Swift LM](https://github.com/ml-explore/mlx-swift-lm), [MLX-LM](https://github.com/ml-explore/mlx-lm), [vLLM](https://github.com/vllm-project/vllm), [Candle](https://github.com/huggingface/candle).

## Integration references

These references inform feasibility; they do not establish implemented or qualified behavior. Recheck version-sensitive contracts during implementation.

- [App-server protocol](https://learn.chatgpt.com/docs/app-server) and [native remote transport source](https://github.com/openai/codex/tree/main/codex-rs/app-server-transport/src/transport/remote_control).
- [OpenAI OAuth inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- [OpenAI self-hosted OAuth setup](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).
- [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).
- [Hugging Face model access](https://huggingface.co/docs/hub/models-gated), [ModelScope](https://github.com/modelscope/modelscope_hub), and [Kaggle Models](https://www.kaggle.com/docs/models).
- [Alibaba/Qwen official releases](https://qwen.ai/), [Mistral model catalog](https://docs.mistral.ai/), and [DeepSeek official repositories](https://github.com/deepseek-ai).
- [Rust engine candidate: mistral.rs](https://github.com/EricLBuehler/mistral.rs).
- Selected UI direction: [Flutter](https://docs.flutter.dev/platform-integration/web/faq). Proposed service libraries: [Axum](https://docs.rs/axum/latest/axum/) and [SQLx](https://github.com/transact-rs/sqlx).
- [Rust instrumentation](https://docs.rs/tracing/latest/tracing/attr.instrument.html) and [OpenTelemetry context integration](https://docs.rs/tracing-opentelemetry/latest/tracing_opentelemetry/trait.OpenTelemetrySpanExt.html).

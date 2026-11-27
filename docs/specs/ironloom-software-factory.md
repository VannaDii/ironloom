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

## Lessons learned and operator management

Persist lessons in PostgreSQL with stable IDs and provenance identifying the originating project, assignment, and source interaction or work. Retention is independent of worktree/artifact cleanup: completing or cleaning up an assignment does not delete its lessons or require a retention question. Authorized explicit deletion remains available. Keep recorded operator answers distinguishable from worker-derived lessons; a lesson does not become approval or override an instruction merely because it is stored or shared.

The operator must explicitly choose the default lesson-handling mode during first-time setup. Setup remains incomplete until that choice is saved; do not silently select a mode. This setting controls broader sharing and later management, not whether lessons apply locally. In every mode, lessons apply directly and immediately within their originating project and assignment, subject to explicit per-lesson restrictions and existing permissions. Notify affected active workers of new applicable lessons and include them at the next model/tool decision boundary; no completion or review step is required, and already-dispatched inference cannot be retroactively changed.

The three modes are:

| Mode | Behavior |
| --- | --- |
| Keep lessons across projects | New lessons are shared for reuse across projects and assignments within the installation, subject to the configured sharing authority. |
| Keep lessons isolated to projects | Apply new lessons immediately within their originating project and assignment, without automatic cross-project sharing. |
| Track all; decide later | Apply new lessons immediately within their originating project and assignment; retain them for the operator to promote or prune later. Do not automatically share across projects. |

Explicit per-lesson decisions take precedence over the configured mode. Record the selected scope on each lesson; changing the mode governs new lessons and does not silently broaden previously restricted records. Configuring automatic sharing requires authority to share the affected lessons; a lesson that cannot be shared stays within its authorized local scope and still applies there immediately. No mode requires the operator to answer a new question at every assignment completion.

The Flutter interface supports reviewing and managing lessons, showing origin, content, and current scope. Authorized users can delete a lesson, sequester it to a project or assignment, or promote it to an installation-shared lesson visible to all projects and assignments. Enforce view/manage/share permissions through OpenFGA. Sharing a lesson grants access to its approved content, not automatically to private source conversations, files, or credentials. Preserve origin references without exposing inaccessible source content.

Track lesson revisions and notify affected workers when lessons are created, changed, restricted, or deleted. Refresh managed lesson context before the next decision, including removing stale automatic inclusions. Keep this dynamic context separate from copied role instructions: immediate lesson updates do not trigger the instruction-template approval question. Apply scope changes and deletions to subsequent lesson retrieval. Existing recorded conversations are not silently rewritten; changes to copied active instructions still follow the agreed operator-controlled update flow. Keep applicable remembered answers available under their existing authority; lesson-sharing configuration does not turn a historical answer into broader authorization.

## Web service and setup

Ironloom owns authenticated configuration and interaction through a runtime web application, separate from the static public documentation site. Provide durable chat history, streamed messages and tool activity, worker progress, clarification questions, plan approval, follow-up steering, cancellation, pause/resume, and reconnection. Work continues when the browser disconnects. Client reconnection restores persisted state without itself resubmitting work; web and native clients share execution state. The selected service stack is Tokio, Axum, and SQLx/PostgreSQL, with HTTP commands and replayable SSE for the web client. Native protocols map to the same service operations. Persist command identities and event cursors; SSE alone does not provide durable replay or duplicate-request handling.

Support multiple human accounts from the first release, with both Ironloom-managed login and external OpenID Connect login. The first authenticated user to successfully redeem the initial setup token becomes the sole initial administrator. Establish that account and consume the token atomically so concurrent attempts cannot create multiple bootstrap administrators. The token expires upon redemption and cannot be reused or replaced by newly minted administrator tokens; this is a one-time installation operation. Persist completion across restarts, and never reopen bootstrap after a storage/authentication error or because the original token remains in infrastructure configuration. The established administrator assigns permissions to other users. Successful local/OIDC login alone grants no administrator authority.

Keep service login separate from provider inference credentials. Define project access and approval authority explicitly, and map native-client actions to an authorized human account rather than treating a connected host as unrestricted authority. Use OpenFGA for fine-grained permissions covering humans, worker identities, projects, assignments, files, credentials, conversations, and other identified resources. The approved enforcement design combines an Airlock-style tool gateway, live OpenFGA checks, and native process/filesystem isolation. This selects the layered approach, not a dependency on WorkOS. A relationship check alone cannot constrain a subprocess. Projects are creator-owned with explicit membership and shipped permission presets for viewing, operating, approving, and managing; OpenFGA grants can be finer-grained. Administrators explicitly grant themselves access before viewing a private project, and that grant is recorded. Credentials are private by default; permission to use one is separate from permission to replace, share, or delete it. Workers receive credential references rather than secret values; trusted service adapters resolve credentials for authorized use.

Use Flutter/Dart for the operator UI, with web delivery first and a shared client architecture for later desktop/mobile applications. The web client derives its API/connection base from its serving web address, including the configured deployment path. Future native clients require a server address and keep authentication scoped to that connection. Keep Rust service/domain logic and the public VitePress documentation separate from the Flutter client. Desktop/mobile packaging is future scope, not an added first-release deliverable. Streaming, authentication, text selection/copy, keyboard use, accessibility, and reconnect must work through the shared client boundary without assuming browser-only APIs.

Graceful shutdown stops new dispatch and persists current work state. Handle SIGINT, SIGTERM, and other catchable shutdown requests with best-effort persistence and owned-process cleanup within the available shutdown time. Forced termination, a crash, or power loss may prevent any final write: resume from the latest durable state, accepting that recent or active inference may need to run again. Do not promise exactly-once inference or persistence after an uncatchable termination. Reconcile uncertain external mutations before retrying them; repeating inference does not authorize blindly repeating a merge, publication, or deployment.

Serve a small first-time setup screen as the default landing page while setup is incomplete. This is a default route, not a restriction to that page: authenticated users can visit other available pages. Once setup is complete, the default page is a project dashboard ordered by most recent human interaction first. Persist the interaction timestamp with project metadata; background worker activity must not silently reorder that list.

Save setup progress and show every remaining required step with its status, reason, and direct action:

- Use the configured PostgreSQL connection string, or service-managed local PostgreSQL when no connection string is configured, and verify infrastructure-configured persistent roots for models, the managed database, and projects/Git. The database root is unused when connecting to an externally managed PostgreSQL server. Missing infrastructure configuration links to deployment instructions rather than suggesting arbitrary browser-selected paths.
- Select enabled GPUs when local inference is selected.
- Connect chosen inference credentials and any model-source account needed for downloads.
- Assign models and applicable reasoning effort to each enabled role.
- Confirm the proposed delivery mode or explicitly choose another permitted mode.
- Explicitly select and save the default lesson-handling mode: share across projects, isolate to projects, or track all for later promotion/pruning. Missing selection blocks setup completion and execution readiness, while web/setup and infrastructure endpoints remain available.
- Complete native remote-host connection setup when enabling that connection.

Requirements depend on configuration: OAuth-backed inference does not require an API key; remote-only inference does not require a GPU; public downloads do not require unnecessary source accounts. Preserve encrypted credentials, environment precedence, and existing setup-key protections. Do not expose secrets to browsers or worker prompts.

Startup must positively identify missing or incomplete configuration and present setup with the required completion or correction actions. Distinguish that state from unavailable storage, corrupt configuration, or decryption failure; show the actual problem without resetting identity or overwriting existing setup. Database connection settings and encryption-key access must be available before opening the selected database. Keep setup/correction guidance reachable when the web service can operate, without misreporting failed infrastructure as healthy.

A previously configured project's unavailable folder is a project-level storage issue, not a reason to restart first-time setup. Health and configuration remain accessible while work is blocked.

Infrastructure health/readiness endpoints report actual service health and ability to serve web requests independently of assignment execution readiness. Incomplete team/model setup must not make an otherwise functioning web service unready or remove setup from Kubernetes Service traffic. Execution status separately reports unmet prerequisites and blocks affected assignments. Do not make unhealthy infrastructure report healthy merely to keep setup visible.

HTTP commands plus replayable server-sent events on Axum are the selected web transport. Normalize provider events into Ironloom events rather than tying the UI to one provider.

## Native remote-host integration and authentication

Native ChatGPT/Codex remote-host integration is required: Ironloom conversations and work must be visible and controllable through native clients. An MCP plugin is not a substitute, and running Codex as the factory's coding worker is not the requested integration direction.

Investigate host enrollment, pairing, authentication refresh, session discovery/history, streaming, steering, questions/approvals, cancellation, reconnect, and client lifecycle expectations. Evaluate a thin protocol adapter around Ironloom's own session and execution state. Do not assume implementing app-server JSON-RPC alone establishes compatibility with the hosted relay and native clients.

Native remote-host support already exists: Vanna runs multiple Codex services on VMs connected to Codex Desktop. Treat that working setup as the integration reference. The remaining investigation is how Ironloom implements the existing connection and exposes its own sessions and multi-provider execution through it; general remote-host feasibility is not an open question.

Use the public app-server and remote-control sources as compatibility references for the direct Rust implementation, mapping Ironloom's session lifecycle to the existing protocol without adopting the upstream transport/state runtime. Pin the protocol/version used during qualification. Begin with deterministic responses and protocol tests, without inference. Verify Ironloom-specific compatibility in each required client; the working Codex Desktop setup does not itself qualify Ironloom or other clients. If implementation reveals an actual architectural flaw, return to the human instead of silently replacing native integration with plugin control.

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

Prefer an embedded Rust engine. mistral.rs and llama.cpp are selected as the first implementation passes, not performance winners or the final engine set. Use a service-owned helper for llama.cpp without weakening the prohibition on authored unsafe Rust. Vanna expects faster macOS options based on first-hand experience; plan immediate expansion to additional engines, including evaluating MLX and Splash integration, rather than deferring extensibility until after qualification. No engine is qualified yet. Python embedding and any engine porting require Vanna's explicit approval when a concrete need is established; present the gap, recommendation, and tradeoff first. Neither is an automatic fallback. No local inference is authorized during this planning work.

Design the initial engine boundary for multiple enabled engines and near-term expansion. Model profiles identify their chosen compatible engine/version and backend; do not silently change engines as a fallback. Ironloom coordinates device reservations, active-use protection, and LRU residency across engines so independent allocators cannot each assume the same memory is free. Include engine identity/version in local model provenance and telemetry. Any managed helper remains under Ironloom lifecycle control; it must not expose an alternative worker execution channel.

The initial engine interface covers capability discovery, model and optional draft-model requirements, streaming generation/tool output and usage, cancellation, load/reuse/unload, observed resource use, and failure/restart state. Describe engine-specific formats, quantization, context/cache behavior, batching, speculative decoding, and optional accelerators as capabilities and resource requirements, not assumptions inherited from the first two drivers. Keep orchestration independent of embedded versus managed-helper execution. Unsupported capabilities remain explicit; do not invent an implementation of every optional feature up front.

Give each physical GPU a canonical identity shared across service instances and container views. Vendor hardware UUIDs are preferred where available; otherwise reconcile host-scoped hardware identity to a durable device record. Container names, node IDs, device ordinals, model names, and PCI addresses alone are not universal physical identifiers. Keep physical-host identity distinct from service-node identity; provision the same host identity to containers on the same host. Record partition/virtual-device identity and its parent GPU so overlapping views cannot double-count capacity. Reconcile discovery after restart, driver changes, repartitioning, or hardware replacement; ambiguous identity blocks admission until resolved rather than creating another capacity pool.

All Ironloom consumers of the same physical GPU coordinate through one resource authority, including separate containers. Atomically reserve memory and configured concurrency across engines and aliases before admitting work; account for resident models, active requests, caches, drafts, and shared-memory pressure. Losing ownership stops new admissions, and capacity is not reclaimed until previous execution is reconciled. Observe external usage and leave configured headroom; identification and cooperative reservations cannot guarantee performance or prevent allocations by unrelated applications. Devices shared with independent installations require a common resource authority or infrastructure-enforced exclusive allocation. Ordinary fixtures cover duplicate discovery, overlapping partitions, contention, and ownership loss; hardware enforcement/performance remain unqualified until tested.

Identity implementation references: [NVIDIA UUIDs](https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html), [AMD partition identity](https://rocm.docs.amd.com/projects/amdsmi/en/docs-7.14.0/conceptual/partition.html), [Metal registry identity](https://developer.apple.com/documentation/metal/mtldevice/registryid). Metal documents identity across tasks, not a universal permanent hardware UUID; host scoping and restart reconciliation remain necessary.

Manage loaded models with LRU eviction constrained by active use and GPU placement:

1. Reuse an already-loaded compatible instance across roles when possible.
2. Keep idle models resident while memory permits.
3. Reserve capacity before admitting a load; avoid duplicate concurrent loads of the same instance.
4. Unload the least recently used eligible idle model when capacity is needed.
5. Never evict a model serving active inference requests. Once inference finishes, the loaded model is an ordinary LRU candidate even if its worker remains alive or is waiting for tools. Worker lifetime is not a residency lock. Respect bindings and multi-GPU placement.
6. Queue and explain requests when no safe eviction makes room; do not silently switch models.

Distinguish resident-model identity from inference request/session identity. Loaded weights may be reused while conversation context, generation state, tool calls, cancellation, and context-cache ownership remain isolated per authorized request/session. Cancelling one request must not terminate another request using the same resident model; cache reuse must preserve request content and authorization boundaries.

Residency identity includes checkpoint, quantization, engine configuration, and placement. Unloading releases inference memory, not downloaded weights. Disk retention is a separate operator-controlled policy.

## Database, projects, assignments, and artifacts

Use PostgreSQL exclusively. Connect using the infrastructure-provided connection string when configured; otherwise manage a local PostgreSQL server. SQLite is excluded, including adapter and authorization-service storage. An invalid connection string or unavailable configured server must not trigger a fresh local database. The database owns organizational metadata: stable project IDs, mutable names, configured locations, conversations, operator questions/answers and their scope, lessons with origin and sharing scope, plan revisions, approvals, assignments, lifecycle, and execution/usage records. GitHub remains authoritative for published specs, repository state, pull requests, reviews, checks, and merges; local caches cannot override fresh source-of-truth state.

Require separate infrastructure-configured persistent roots by storage type:

| Root | Contents and lifetime |
| --- | --- |
| Models | Shared downloaded model files, independent of project cleanup |
| Database | Managed PostgreSQL data; unused when connecting to an externally managed PostgreSQL server |
| Projects/Git | Complete project folders, backing Git repositories, assignment worktrees, and role artifacts |

Roots are configured through deployment/native-service configuration, not arbitrary worker or browser filesystem access. Persist the complete projects/Git root and model root across service or pod replacement; assignment worktrees cannot use disposable `emptyDir` storage. Keep organizational metadata and durable service/host identity outside the project root, using the selected database for those records. A missing projects mount must not hide project records or reset host identity. Do not initialize a replacement database when an existing data root is missing or inaccessible. Changing database configuration must not silently move data or create a new installation.

Project listing must work from database records even when a project folder is unavailable. Show Storage unavailable, preserve metadata, and pause affected filesystem work. Do not recreate an empty project at a missing mount. Database migrations preserve IDs and references.

Multiple service instances connected to this installation share its projects, users, runs, installation identity, and one-time administrator enrollment. Give each service instance a stable node identity and record which node owns each workspace, process, and GPU allocation. Shared PostgreSQL metadata does not make local files or GPUs shared. Start with assignment execution on its owning node, including concurrent roles in its shared worktree; route requests to that owner. Use atomic claims and renewable leases for dispatch, and prevent stale owners from issuing new mutations. Lease expiry alone does not prove an old process stopped: reconcile or fence its execution before takeover. An unreachable workspace remains unavailable rather than being recreated elsewhere. Shared approval, budget, and bootstrap updates must remain safe under concurrent service requests.

Managed PostgreSQL listens privately by default. Exposing its port for additional service instances is explicit infrastructure configuration with authentication, network restrictions, and transport protection. One designated owner manages its data, startup, shutdown, backup, and upgrades; client-instance shutdown must not stop a database still serving other instances. OpenFGA uses PostgreSQL too, with separately owned database/schema and migrations. The managed baseline is PostgreSQL 18 with its current maintenance release. Manage native PostgreSQL/OpenFGA processes on Mac/Linux and supervise them separately in container deployments. Publish the Ironloom Helm chart with included PostgreSQL and OpenFGA services, persistence, secrets wiring, and initialization/migrations so a normal deployment does not require manual assembly. Retain the configured external-PostgreSQL option; only the designated database owner initializes managed storage. Sharing a database does not authorize one instance to bypass installation membership or credential protections. An administrator explicitly enrolls additional service nodes. Define authenticated node registration and shared secret/key access in the common service contract before implementation. Tools execute on the workspace-owning node; inference may use another configured node. One resource authority manages each physical GPU pool across all node/container views. Version one uses coordinated service upgrades; mixed-version rolling upgrades are deferred.

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

The agreed delivery split is primary build-out without inference runs on Cinder and Ivy, followed by combined integration and final inference work on the Mac. This describes development ownership; the separate shared-installation requirement above defines product behavior across service instances. The work allocation below is agreed; implementation and dispatch are not authorized by this planning document.

### 1. Shared contracts before parallel implementation

Resolve the decisions required for the affected work below and establish one shared baseline. Cinder owns common domain/storage/service contracts; Ivy owns transport/provider mapping against them. Agree exact new module/crate paths before concurrent edits. Define operator/project authority, plan and instruction revisions, assignment/worker lifecycle, persisted commands and replayable events, streaming inference/tool requests, cancellation, usage, lesson provenance/required setup mode/scope, immediate local propagation, and management permissions, and GPU-engine lifecycle through public Rust contracts and their schemas. Use the selected HTTP/SSE and PostgreSQL stack and choose migrations once; do not let each lane invent its own session or approval model.

All wire models on both sides implement a common validation contract: a Rust trait and a Dart interface/base contract with model-specific implementations. Decode structure, validate fields and cross-field invariants (including nested models), then expose the value to domain logic or client application state. Use a shared decoding/validation entrypoint so callers cannot accidentally omit validation. Constructors and deserialization enforce the same domain invariants; derived deserialization or generated schemas alone must not bypass them. Return structured, field-specific validation errors without echoing secrets. The service validates independently of Flutter, including native-client requests; validation does not replace authentication or current resource authorization. Keep Rust/Dart contracts and schemas aligned, with focused valid/invalid fixtures exercising the actual decode path in both languages. Cinder defines the contract and Rust behavior; Ivy implements the Dart side against it.

Replace the synchronous single-response worker contract and minimal queue lifecycle with explicit contracts for streamed progress, completed operations, waiting for a human, waiting for resources, pause/resume, cancellation requests, and confirmed termination. A request to cancel is not proof that the process or inference stopped. Both adapters and scheduler use the same states and transitions rather than independently inferring completion from a disconnected stream.

Cinder also owns `ironloom-artifacts`, including removal of required Discord thread identity from new artifact contracts while preserving needed historical records, and owns the HTTP/SSE server and authentication backend. Ivy owns the Flutter client, native protocol, and model/source/device adapters. Ivy checks the initial interfaces against client and adapter needs before the common baseline is used for parallel build-out.

Map the existing native-host protocol to these contracts early, using deterministic responses and the working VM setup as the reference. Check session visibility, input, questions/approvals, cancellation, and reconnect without model calls. If the upstream transport imposes a constraint on the shared contracts, resolve it before dependent work is split. This does not reopen whether native remote hosts exist.

### 2. Primary build-out: no Ironloom inference runs

Cinder and Ivy have no GPUs. Use scripted model responses, simulated engine/device events, and provider HTTP fixtures. Their GPU work is CPU-only implementation and testing of contracts, identity reconciliation, scheduling, and adapter behavior, not running a GPU. They may author platform driver code, but platform compilation/linking and actual discovery that require unavailable SDKs/hardware are completed on the appropriate host. Mac Metal discovery, real residency, throughput, and inference validation belong to the Mac phase; Linux GPU support remains explicitly unqualified without corresponding hardware. No local or hosted generation, embedding calls, model warm-up, or inference-based capability probes may run through Ironloom or its tests in this phase. This restriction concerns the software under development; it does not prohibit the coding agents on Cinder and Ivy from using their configured models to implement it. Build real adapters and engine integration where selected, but keep inference execution out of startup, ordinary tests, and CI. Do not treat simulations as model qualification.

| Owner | Owned work and existing paths | Dependency and handoff |
| --- | --- | --- |
| Cinder: service and execution | `crates/ironloom-{core,config,storage,artifacts,policy,queue,process-graph,supervisor,workers,worktrees,gates,observability,schemas}`; HTTP/SSE server and authentication backend; runtime composition; workspace Cargo manifests/lockfile; Docker/Helm and CI | Managed/external PostgreSQL and bundled Helm services, shared-installation ownership and dispatch, OpenFGA authorization, GPU identity/reservation/LRU policy with simulated devices, durable lifecycle/recovery, copied instructions, remembered answers and durable scoped lessons, editable standard roles, controlled tools/shared worktrees, merge coordination, streaming commands, OTel/accounting, and persistent deployment. Export service interfaces for Ivy; integrate adapter wiring after its implementation lands. |
| Ivy: operator UX and adapters | New Flutter operator app and native/model/source/device adapter modules, with exact paths agreed in the shared baseline; their package manifests, tests, and schemas | Local/OIDC login UI consuming Cinder's authentication API, setup/dashboard/streaming chat, team/model/source/device/budget controls, lesson review/scope/deletion controls, native remote-host transport, OpenAI/Anthropic/configurable endpoint adapters, source discovery/downloads with dynamic compatibility filters, and engine/device adapters using fixtures. Cinder owns reservation/LRU policy; Ivy implements the adapter operations it calls. Neither host runs or qualifies GPU inference. Use Cinder's service/policy/storage interfaces; keep business decisions out of transport code. |

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

Settled: recorded administrator self-grants for private projects; private credentials with separate use/management permissions; PostgreSQL lessons with operator-configured sharing and Flutter management; Tokio/Axum, SQLx/PostgreSQL, HTTP commands and replayable SSE; creator-owned projects with explicit membership and permission presets; direct Rust native-protocol implementation; initial mistral.rs/llama.cpp drivers with immediate engine expansion planned; PostgreSQL 18 managed baseline and included Helm services; PostgreSQL only, managed locally when no connection string is configured; one installation shared across service instances; OpenFGA and the layered tool-gateway/native-isolation design; multiple human accounts; local login and OIDC; one-time token redemption establishes the sole initial administrator, with no replacement admin tokens; delivery mode explicitly confirmed during setup; Flutter web UI with future native clients using a server address; native macOS/Linux and Alpine targets; untested Linux/Alpine GPU backends may ship explicitly unqualified; no Ironloom inference runs during Cinder/Ivy build-out; final inference work on the Mac. Engine-driven model discovery filters belong in primary build-out; actual role/model settings remain operator configuration.

| Decision | Recommendation or required resolution | Needed before |
| --- | --- | --- |
| Resource authorization and sharing | Product policy is settled: recorded administrator self-grants for private projects; private credentials with separate use/management grants; configurable lesson handling and explicit per-lesson scope controls. Translate these into the initial shared authorization contracts and OpenFGA model. | Authorization/database contracts |
| Service/database stack and public contracts | Flutter, Tokio/Axum, HTTP commands plus replayable SSE, and SQLx/PostgreSQL are selected. Managed PostgreSQL 18 and included Helm services are selected. Fix dependency pins, adapter boundaries, schema/migrations, event/request semantics, node enrollment, shared key access, and canonical GPU identities in the initial contracts. | Parallel build-out |
| Native protocol integration | Implement the native protocol directly in Rust, using pinned upstream protocol/source behavior as the compatibility reference. Map native identities and sessions to Ironloom authority and PostgreSQL state; do not reuse the upstream SQLite runtime. Define compatibility/version handling and deterministic native-client scenarios. | Dependent session/auth implementation |
| Platform enforcement and build matrix | Linux/Alpine bubblewrap plus seccomp is selected; Seatbelt is the provisional macOS choice following the lifecycle review below. Confirm minimum OS versions and validate custom-profile enforcement with ordinary processes on the Mac. Preserve Rust/CI gates; no automatic architecture substitution. | Execution and deployment implementation |
| Engine set and backend scope | mistral.rs and llama.cpp are selected first passes. Pin versions and build the initial contract for rapid additional-engine adoption, including drafts, caches, streaming, memory lifecycle, and accelerators. Select concrete MLX/Splash integration routes next; Python/porting still require approval. Capability metadata is not hardware qualification. | Concrete engine drivers and model compatibility catalog; interfaces can use simulated engines |
| Live-run configuration | Human-selected role models and reasoning effort, exact local weights/revisions/quantization, memory/context/concurrency and generation controls, credentials, project, and any optional budget. The configuration/validation UX and dynamic engine filters are implemented earlier. | Actual Mac inference runs |

Do not turn implementation choices into additional operator workflow rules. The planner and implementors retain the agreed role-level judgment; resolve shared technical interfaces before dividing work, and ask the operator when instructions leave uncertainty.

## Selected boundaries and remaining options

Selections are identified explicitly below; remaining options are source-informed recommendations, not approved dependencies or measured performance results. No models were run for this comparison.

### Resource authorization and tool gateway — selected

OpenFGA is the grant authority. The approved Airlock-style gateway resolves the authenticated human/worker, assignment, operation, and actual resource identifiers from validated tool arguments; checks current OpenFGA grants and approved task scope; then dispatches through the native execution boundary. Resolve all affected resources, including both ends of a move. Do not trust worker-supplied identity or infer filesystem confinement by parsing shell text. OS enforcement covers subprocesses and descendants. Denied, unavailable, and approval-required outcomes remain distinct; none silently permits execution. Recheck grants at dispatch and handle revocation of active work through cancellation/containment, without claiming that a database change instantly revokes an already-open file handle.

Use deterministic policy checks for this boundary; no mandatory extra inference call per tool action. Instructions guide task judgment, and uncovered or uncertain decisions go to the operator. WorkOS Airlock demonstrates the distinction between fixed permissions and optional runtime judgment; adopting its layered approach does not select its hosted service or add a model-based policy judge. Sources: [Airlock rules and runtime checks](https://workos.com/blog/airlock-deterministic-rules-runtime-checks), [OpenFGA relationships](https://openfga.dev/docs/modeling/parent-child).

The reviewed `VannaDii/fga-lens` revision is `b27d1fc2f01a6bcf826fe1a6520458c9beeb384a`. Reuse its design lessons: validated resource/relation requests, explicit authorization-model revisions, batched checks with per-item outcomes, and higher-consistency reads where current permissions matter. Use cache-bypassing checks at authorization boundaries; do not claim caching automatically provides live revocation. Its workbench UI and SQLite packaging are not Ironloom dependencies. Sources: [query validation](https://github.com/VannaDii/fga-lens/blob/b27d1fc2f01a6bcf826fe1a6520458c9beeb384a/lib/workbench-query-request.ts), [server checks](https://github.com/VannaDii/fga-lens/blob/b27d1fc2f01a6bcf826fe1a6520458c9beeb384a/lib/workbench-server.ts), [OpenFGA consistency](https://openfga.dev/docs/interacting/consistency).

Selected packaging is a managed process for native installs and an included chart-managed service for Kubernetes, backed by PostgreSQL. Persist the sole bootstrap administrator identity and token consumption atomically in Ironloom storage, with recoverable grant-initialization state. If OpenFGA grant initialization fails afterward, retry for that same account until complete; do not reopen enrollment or mint another token. Do not assume Ironloom database changes and OpenFGA API calls form one transaction. Model worker delegation explicitly and use project/folder inheritance where appropriate. All service instances use the installation's same authorization store and coordinated model revision. Source: [OpenFGA storage configuration](https://openfga.dev/docs/getting-started/setup-openfga/configuration).

### Native remote-host transport — selected

Implement a dedicated native-compatible transport directly in Rust. Ironloom owns identity mapping, sessions, lifecycle, and PostgreSQL persistence; accept protocol maintenance to minimize integration bridges. Pin upstream protocol/source revisions as compatibility references rather than adapting the upstream transport/state runtime. Native remote-host control remains required; running a coding CLI or exposing a plugin is not a substitute.

The inspected upstream revision `e2e7dabd4587c7b0fbf934e6a93b6cec8245751d` remains a behavior reference. Its `StateRuntime` SQLite dependency is not an Ironloom dependency. Establish enrollment/authentication, session visibility, input, questions/approvals, cancellation, and reconnect with deterministic responses before dependent interfaces are fixed. Sources: [transport behavior](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/app-server-transport/src/transport/remote_control/controller.rs#L266), [upstream state](https://github.com/openai/codex/blob/e2e7dabd4587c7b0fbf934e6a93b6cec8245751d/codex-rs/state/src/runtime.rs#L102).

### Execution sandbox and platform baseline

The tool gateway plus live OpenFGA plus native isolation is approved. Linux/Alpine uses bubblewrap plus seccomp; Seatbelt remains the provisional macOS mechanism pending applicable Mac checks, with minimum versions still to confirm; Airlock-style policy mediation does not replace OS isolation.

| Option | Benefit | Tradeoff |
| --- | --- | --- |
| Native platform sandboxes: Seatbelt provisionally on macOS; bubblewrap plus seccomp on Linux/Alpine (selected direction) | Fits native operation, shared worktrees, and constrained subprocesses without a mandatory VM. Reuse reviewed upstream primitives where practical. | Seatbelt's interface is deprecated/poorly documented. Linux namespaces and container runtime policy must permit the required sandbox; a container image alone does not establish that. |
| VM/container-isolated execution | Separate execution environments and stronger separation from host services. | More lifecycle/storage plumbing; a Linux VM cannot validate native macOS builds, and per-role path enforcement is still required inside a shared assignment. Not a replacement for the selected native service targets. |

Proposed initial qualification targets: Apple Silicon macOS 14+; Linux x86-64/arm64 with kernel 6.6+ and the required namespace/seccomp capabilities; Alpine 3.24 containers on such a host. These are candidates to approve and validate, not established minimums guaranteed by an engine or UI framework. Broader older-platform support adds testing without resolving the immediate build-out. Keep server/sandbox support separate from future Flutter desktop/mobile platform coverage. Never run a worker unsandboxed because required features are missing. Sources: [upstream sandbox design](https://openai.com/index/inside-the-codex-sandbox/), [bubblewrap](https://github.com/containers/bubblewrap), [Flutter platform coverage](https://docs.flutter.dev/reference/supported-platforms).

Seatbelt lifecycle review (2026-11-27): no published Apple removal date was found, which is not a promise of future availability. Apple's local `sandbox-exec(1)` and `sandbox_init(3)` manuals mark these interfaces deprecated; the latter warns that the old named profiles cannot be used when building against SDK 27+. Do not use those named profiles. Custom SBPL profiles through `sandbox-exec` are a different path and still require ordinary-process validation on supported macOS releases. Apple DTS describes custom policy specification as unsupported for third-party development; App Sandbox's entitlement model is not an established replacement for Ironloom's per-assignment command restrictions. Retain the provisional native path and isolate its implementation; if qualification shows it cannot meet the approved boundaries, present the concrete flaw and replacement tradeoff to Vanna before changing architecture. Sources: [Apple DTS explanation](https://developer.apple.com/forums/thread/661939), [Apple App Sandbox](https://developer.apple.com/documentation/security/app-sandbox), [current upstream Seatbelt use](https://openai.com/index/inside-the-codex-sandbox/). Local manual inspection established the SDK warning; no sandbox execution or inference was performed during this review.

### Inference engines

| Engine | Strengths for Ironloom | Main cost or limitation |
| --- | --- | --- |
| mistral.rs | Rust embedding; Metal/CUDA, batching, paged attention, quantization, and multiple model architectures. Selected first implementation for the Rust preference. | Model/format/backend support remains version-specific; Alpine and exact hardware need qualification. Built-in agent/tool execution must not bypass Ironloom tools. |
| llama.cpp | Broad GGUF ecosystem and hardware backends including Metal, CUDA, HIP, and Vulkan; useful complementary coverage. | C/C++, requiring a maintained safe binding or a service-owned helper and native build packaging. GGUF support does not mean every architecture works. |
| MLX Swift LM / MLX-LM | Apple Silicon-focused option with quantized models and streaming; Swift offers a route without embedding Python. | Apple-specific integration and a Swift/native bridge or managed helper. The Python MLX-LM route needs explicit Python approval. Swift and Python model support must be checked separately. |
| vLLM | Server-oriented batching, cache management, distributed execution, and broad model/tool-serving features; candidate for high-concurrency Linux GPUs. | Python/PyTorch and GPU packaging are a larger fit change for the Rust/Alpine design. Do not adopt a managed Python runtime without an explicit decision; an operator-managed compatible endpoint is a separate existing option. |
| Splash | Native Apple Silicon engine with GGUF and selected MLX formats, speculative decoding, streaming compatible APIs, and explicit memory release controls. Promising Mac performance candidate. | Requires M3 or newer and macOS 26.4+ at the reviewed revision; model-family/draft compatibility is narrower than generic GGUF support. Official server uses Python. Managed Python adoption requires an explicit decision; a direct native integration needs investigation. |
| Candle directly | Rust model/tensor framework with GPU support and detailed control. | More model, decoding, batching, and serving integration to own; not the smallest route to broad factory support. |

Selected first passes: mistral.rs and llama.cpp with shared memory/LRU control. These establish working adapters, not an expected macOS performance ceiling. Plan rapid additional-engine integration, prioritizing evaluation of MLX and Splash routes; the initial interfaces must accommodate them. Vanna reports better performance from other macOS options; comparative Ironloom results remain for the authorized Mac phase. Managed Python and engine porting still need explicit approval; compatible external endpoints remain available. Actual latency, throughput, and memory efficiency depend on the selected model, quantization, context, and concurrency; source feature lists cannot rank speed on this Mac. Compare those during the authorized inference phase. Sources: [mistral.rs](https://github.com/EricLBuehler/mistral.rs), [llama.cpp backends](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [MLX Swift LM](https://github.com/ml-explore/mlx-swift-lm), [MLX-LM](https://github.com/ml-explore/mlx-lm), [vLLM](https://github.com/vllm-project/vllm), [Candle](https://github.com/huggingface/candle).

Splash was reviewed at `d40c250ff248938edebdb91fb6124514e32daeaa`. Its published comparisons report roughly 2.5–5.3× generation throughput over llama.cpp for the particular models and Macs shown; these are vendor results, not Ironloom measurements or a universal ranking. Treat Splash as an additional candidate, not a selected replacement. Its stock server sets up Python dependencies, loads weights, and warms up on start; do not run it in the no-inference build phase. A service-managed Python route needs Vanna's decision; investigate whether a maintainable native boundary can avoid it without assuming a stable public ABI or authorizing a port. An operator-managed compatible endpoint is already an independent option. Sources: [Splash engine and benchmarks](https://github.com/incoai/splash/tree/d40c250ff248938edebdb91fb6124514e32daeaa), [server lifecycle](https://github.com/incoai/splash/blob/d40c250ff248938edebdb91fb6124514e32daeaa/docs/server.md), [Python server](https://github.com/incoai/splash/blob/d40c250ff248938edebdb91fb6124514e32daeaa/server/server.py).

If Splash is selected, model filters and residency estimates must include its minimum OS/chip, supported target/draft pairing, both weight sets, and any additional accelerator use. Reconcile its idle release and memory-release API with Ironloom's central LRU and active-request protection; endpoint compatibility alone does not establish lifecycle compatibility. These requirements are engine-specific and do not raise the minimum OS for every Ironloom deployment.

## Integration references

These references inform feasibility; they do not establish implemented or qualified behavior. Recheck version-sensitive contracts during implementation.

- [App-server protocol](https://learn.chatgpt.com/docs/app-server) and [native remote transport source](https://github.com/openai/codex/tree/main/codex-rs/app-server-transport/src/transport/remote_control).
- [OpenAI OAuth inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference) and [limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- [OpenAI self-hosted OAuth setup](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms).
- [Anthropic streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).
- [Hugging Face model access](https://huggingface.co/docs/hub/models-gated), [ModelScope](https://github.com/modelscope/modelscope_hub), and [Kaggle Models](https://www.kaggle.com/docs/models).
- [Alibaba/Qwen official releases](https://qwen.ai/), [Mistral model catalog](https://docs.mistral.ai/), and [DeepSeek official repositories](https://github.com/deepseek-ai).
- [Rust engine candidate: mistral.rs](https://github.com/EricLBuehler/mistral.rs).
- Selected UI direction: [Flutter](https://docs.flutter.dev/platform-integration/web/faq). Selected service libraries: [Axum](https://docs.rs/axum/latest/axum/) and [SQLx](https://github.com/transact-rs/sqlx).
- [Rust instrumentation](https://docs.rs/tracing/latest/tracing/attr.instrument.html) and [OpenTelemetry context integration](https://docs.rs/tracing-opentelemetry/latest/tracing_opentelemetry/trait.OpenTelemetrySpanExt.html).

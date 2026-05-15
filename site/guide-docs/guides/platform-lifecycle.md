# Platform Lifecycle

## End-to-End Flow

1. Research creates a structured brief for the capability or product area.
2. Specs turn that brief into a spec PR and approval-ready artifact.
3. Human approval unblocks slicing.
4. Slicing produces dependency-aware implementation units.
5. Implementation pull requests execute gates, review, and remediation loops.
6. Continuation decisions flow through OpenClaw with auditable artifacts; Discord can project operator controls when needed.
7. Release automation publishes aligned packages, images, charts, and docs.

For the command-level operator workflow from research through PR acceptance,
use the [Commanded Delivery Flow](./operator-guide.md#commanded-delivery-flow).

## Source of Truth

- GitHub owns specs, pull requests, approvals, reviews, and merge history.
- OpenClaw exposes headless platform behavior to agents and operator workflows.
- Discord exposes optional operator control and audit visibility.
- SonarCloud contributes compliance and quality signals.

## Foundation Phases

1. Normalize package shape, dependency boundaries, and adapter ownership.
2. Complete the OpenClaw and Discord control surface with auditable, thread-aware behavior.
3. Finish docs, compatibility validation, Docker, Helm, and release automation in the phase order defined by `PLATFORM.md`.
4. Tighten SonarCloud and final release readiness after the foundation surfaces are in place.

## Completion Standard

A lifecycle change is complete only when code, artifacts, docs, operator guidance, and release surfaces stay synchronized.

## Acceptance Criteria

- foundation work must satisfy the acceptance criteria defined in `PLATFORM.md`
- headless continuation must remain repository-scoped, artifact-backed, and auditable
- Discord workflows must remain thread-aware and auditable when used
- adapter, docs, and workflow changes must land with the corresponding validation updates

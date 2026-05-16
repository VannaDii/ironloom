# Examples

## Spec to Slice to PR to Merge

1. `create_research_brief` captures the problem statement and evidence.
2. `create_spec_record` converts it into an auditable spec artifact.
3. `create_slice_plan` and `evaluate_slice_plan_readiness` break the work into implementation units.
4. Queue and task tools track claim, update, and status transitions.
5. GitHub and branching tools create pull-request records, update status, and plan dependent rebases.
6. Policy, Discord approvals, and gates decide whether the work can merge.

## Incident Remediation

1. `create_review_finding`
2. `create_remediation_plan`
3. `run_gates`
4. `evaluate_sonar_quality_gate`

## Headless Maintenance Handoff

Use a JSON plan when DevPlat should continue repository maintenance without a
Discord thread binding:

```bash
npm run maintenance:headless -- --plan ./maintenance-plan.json --write-plan ./.devplat/state/next-maintenance-plan.json
```

The input plan contains the current continuation request and any explicit tool
inputs that are safe to run. The handoff plan written by `--write-plan` contains
the updated request with new artifact signals, so the next run can resume from
current lifecycle evidence and stop at the next missing input or approval gate.
Once that handoff file exists, local continuation can use the default state path
and a single external tool input:

```bash
npm run maintenance:headless -- --handoff --tool-input ./.devplat/state/next-tool-input.json
```

`next-tool-input.json` contains the selected `toolName`, that tool's `params`,
and only needs `artifactSignal` when the tool response cannot derive the new
lifecycle artifact signal.

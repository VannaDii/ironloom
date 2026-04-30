import type { SpecRecord, SpecRevision } from './types.js';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeRevision(input: SpecRevision): SpecRevision {
  return {
    ...input,
    version: Math.max(1, Math.trunc(input.version)),
    summary: input.summary.trim(),
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

export function renderSpecPullRequestBody(input: SpecRecord): string {
  const criteria = uniqueTrimmed(input.acceptanceCriteria)
    .map((criterion) => `- [ ] ${criterion}`)
    .join('\n');
  return [
    `## ${input.title.trim()}`,
    '',
    input.objective.trim(),
    '',
    '### Acceptance Criteria',
    criteria,
  ].join('\n');
}

export function createSpecRecord(input: SpecRecord): SpecRecord {
  return {
    ...input,
    title: input.title.trim(),
    objective: input.objective.trim(),
    acceptanceCriteria: uniqueTrimmed(input.acceptanceCriteria),
    version: Math.max(1, Math.trunc(input.version)),
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(input.revisionHistory === undefined
      ? {}
      : { revisionHistory: input.revisionHistory.map(normalizeRevision) }),
    ...(input.renderedPullRequestBody === undefined
      ? {}
      : { renderedPullRequestBody: input.renderedPullRequestBody.trim() }),
    ...(input.sourceArtifactIds === undefined
      ? {}
      : { sourceArtifactIds: uniqueTrimmed(input.sourceArtifactIds) }),
  };
}

export function approveSpecRecord(input: SpecRecord): SpecRecord {
  const record = createSpecRecord(input);
  return {
    ...record,
    approvalState: 'approved',
  };
}

export function updateSpecRecord(input: SpecRecord): SpecRecord {
  const record = createSpecRecord(input);
  const version = record.version + 1;
  const revisionHistory = [
    ...(record.revisionHistory ?? []),
    normalizeRevision({
      version,
      summary: `Updated spec ${record.specId} to version ${String(version)}`,
      updatedAt: record.updatedAt,
    }),
  ];
  return {
    ...record,
    approvalState:
      record.approvalState === 'approved' ? 'review' : record.approvalState,
    version,
    revisionHistory,
    renderedPullRequestBody:
      record.renderedPullRequestBody ?? renderSpecPullRequestBody(record),
  };
}

export function describeSpecRecord(input: SpecRecord): string {
  return `Spec record -> ${input.title}`;
}

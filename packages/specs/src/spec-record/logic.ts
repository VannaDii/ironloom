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
    ...(input.revisionId === undefined
      ? {}
      : { revisionId: input.revisionId.trim() }),
    ...(input.previousVersion === undefined
      ? {}
      : { previousVersion: Math.max(1, Math.trunc(input.previousVersion)) }),
    ...(input.approvalStateBeforeUpdate === undefined
      ? {}
      : { approvalStateBeforeUpdate: input.approvalStateBeforeUpdate.trim() }),
    ...(input.artifactId === undefined
      ? {}
      : { artifactId: input.artifactId.trim() }),
  };
}

export function renderSpecPullRequestBody(input: SpecRecord): string {
  const criteria = uniqueTrimmed(input.acceptanceCriteria)
    .map((criterion) => `- [ ] ${criterion}`)
    .join('\n');
  const sourceArtifacts = uniqueTrimmed(input.sourceArtifactIds ?? []);
  const sourceArtifactSection =
    sourceArtifacts.length === 0
      ? []
      : [
          '',
          '### Source Artifacts',
          sourceArtifacts.map((id) => `- ${id}`).join('\n'),
        ];
  const revisionHistory = (input.revisionHistory ?? []).map(normalizeRevision);
  const revisionHistorySection =
    revisionHistory.length === 0
      ? []
      : [
          '',
          '### Revision History',
          revisionHistory
            .map(
              (revision) =>
                `- v${String(revision.version)}: ${revision.summary}`,
            )
            .join('\n'),
        ];
  return [
    `## ${input.title.trim()}`,
    '',
    '### Metadata',
    `- Spec ID: ${input.specId.trim()}`,
    `- Research ID: ${input.researchId.trim()}`,
    `- Version: ${String(Math.max(1, Math.trunc(input.version)))}`,
    `- Approval state: ${input.approvalState}`,
    '',
    '### Objective',
    input.objective.trim(),
    '',
    '### Acceptance Criteria',
    criteria,
    ...sourceArtifactSection,
    ...revisionHistorySection,
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
      revisionId: `${record.specId}:v${String(version)}`,
      version,
      previousVersion: record.version,
      approvalStateBeforeUpdate: record.approvalState,
      summary: `Updated spec ${record.specId} to version ${String(version)}`,
      updatedAt: record.updatedAt,
    }),
  ];
  const updatedRecord = {
    ...record,
    approvalState:
      record.approvalState === 'approved' ? 'review' : record.approvalState,
    version,
    revisionHistory,
  };

  return {
    ...updatedRecord,
    renderedPullRequestBody: renderSpecPullRequestBody(updatedRecord),
  };
}

export function describeSpecRecord(input: SpecRecord): string {
  return `Spec record -> ${input.title}`;
}

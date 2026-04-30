import type { PullRequestProjection, PullRequestRecord } from './types.js';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePullRequestProjection(
  input: PullRequestProjection,
): PullRequestProjection {
  return {
    body: input.body.trim(),
    checklist: uniqueTrimmed(input.checklist),
    riskSummary: input.riskSummary.trim(),
    validationSummary: input.validationSummary.trim(),
    artifactIds: uniqueTrimmed(input.artifactIds),
  };
}

export function createPullRequestProjection(
  record: PullRequestRecord,
): PullRequestProjection {
  const checklist = uniqueTrimmed(record.labels).map(
    (label) => `Confirm ${label}`,
  );
  return {
    body: record.title.trim(),
    checklist,
    riskSummary: record.mergeReady ? 'Ready for merge' : 'Merge blocked',
    validationSummary:
      record.reviewState === 'approved' ? 'Review approved' : 'Review pending',
    artifactIds: uniqueTrimmed(record.sourceArtifactIds ?? []),
  };
}

export function createPullRequestRecord(
  input: PullRequestRecord,
): PullRequestRecord {
  const labels = uniqueTrimmed(input.labels);
  return {
    ...input,
    branchName: input.branchName.trim(),
    baseBranch: input.baseBranch.trim(),
    title: input.title.trim(),
    labels,
    updatedAt: new Date(input.updatedAt).toISOString(),
    projection:
      input.projection === undefined
        ? createPullRequestProjection({ ...input, labels })
        : normalizePullRequestProjection(input.projection),
    ...(input.sourceArtifactIds === undefined
      ? {}
      : { sourceArtifactIds: uniqueTrimmed(input.sourceArtifactIds) }),
  };
}

export function canMergePullRequest(input: PullRequestRecord): boolean {
  return input.mergeReady && input.reviewState === 'approved';
}

export function describePullRequestRecord(input: PullRequestRecord): string {
  return `PR #${String(input.prNumber)} -> ${input.title}`;
}

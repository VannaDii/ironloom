import { createGitBranchName } from '@vannadii/devplat-core';

import type {
  PullRequestProjection,
  PullRequestRecord,
  PullRequestRemediationProjection,
  PullRequestReviewProjection,
} from './codec.js';

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

function normalizeReviewProjection(
  input: PullRequestReviewProjection,
): PullRequestReviewProjection {
  return {
    summaryId: input.summaryId.trim(),
    findingIds: uniqueTrimmed(input.findingIds),
    blockingFindingIds: uniqueTrimmed(input.blockingFindingIds),
    missingCriteria: uniqueTrimmed(input.missingCriteria),
    implementationMatchesSpec: input.implementationMatchesSpec,
  };
}

function normalizeRemediationProjection(
  input: PullRequestRemediationProjection,
): PullRequestRemediationProjection {
  const nextAction = input.nextAction?.trim();
  return {
    planId: input.planId.trim(),
    successfulActions: uniqueTrimmed(input.successfulActions),
    failedActions: uniqueTrimmed(input.failedActions),
    artifactIds: uniqueTrimmed(input.artifactIds),
    unresolvedFindingIds: uniqueTrimmed(input.unresolvedFindingIds),
    complete: input.complete,
    ...(nextAction === undefined || nextAction.length === 0
      ? {}
      : { nextAction }),
  };
}

function describeReviewProjection(
  reviewProjection: PullRequestReviewProjection | undefined,
): string {
  if (reviewProjection === undefined) {
    return 'Review evidence pending';
  }

  if (
    reviewProjection.implementationMatchesSpec &&
    reviewProjection.blockingFindingIds.length === 0
  ) {
    return `Review approved: ${String(reviewProjection.findingIds.length)} findings, no blocking findings`;
  }

  return `Review blocked: ${String(reviewProjection.blockingFindingIds.length)} blocking findings, ${String(reviewProjection.missingCriteria.length)} missing criteria`;
}

function describeRemediationProjection(
  remediationProjection: PullRequestRemediationProjection | undefined,
): string {
  if (remediationProjection === undefined) {
    return 'Remediation evidence pending';
  }

  if (
    remediationProjection.complete &&
    remediationProjection.unresolvedFindingIds.length === 0
  ) {
    return `Remediation complete: ${String(remediationProjection.successfulActions.length)} actions applied`;
  }

  return `Remediation pending: ${String(remediationProjection.unresolvedFindingIds.length)} unresolved findings`;
}

function createReviewChecklist(
  reviewProjection: PullRequestReviewProjection | undefined,
): string[] {
  if (reviewProjection === undefined) {
    return [];
  }

  return [
    ...(reviewProjection.blockingFindingIds.length === 0
      ? ['Confirm review has no blocking findings']
      : reviewProjection.blockingFindingIds.map(
          (findingId) => `Resolve blocking finding ${findingId}`,
        )),
    ...reviewProjection.missingCriteria.map(
      (criterion) => `Satisfy spec criterion ${criterion}`,
    ),
  ];
}

function createRemediationChecklist(
  remediationProjection: PullRequestRemediationProjection | undefined,
): string[] {
  if (remediationProjection === undefined) {
    return [];
  }

  return remediationProjection.unresolvedFindingIds.length === 0
    ? ['Confirm remediation is complete']
    : remediationProjection.unresolvedFindingIds.map(
        (findingId) => `Resolve remediation finding ${findingId}`,
      );
}

function collectProjectionArtifactIds(record: PullRequestRecord): string[] {
  return uniqueTrimmed([
    ...(record.sourceArtifactIds ?? []),
    ...(record.remediationProjection?.artifactIds ?? []),
    record.reviewProjection?.summaryId ?? '',
    record.remediationProjection?.planId ?? '',
  ]);
}

function renderList(items: readonly string[]): string {
  return items.length === 0
    ? '- None'
    : items.map((item) => `- ${item}`).join('\n');
}

function renderChecklist(items: readonly string[]): string {
  return items.length === 0
    ? '- [x] No open checklist items'
    : items.map((item) => `- [ ] ${item}`).join('\n');
}

function renderPullRequestBody(
  record: PullRequestRecord,
  projection: PullRequestProjection,
): string {
  const reviewProjection = record.reviewProjection;
  const remediationProjection = record.remediationProjection;
  return [
    `# ${record.title.trim()}`,
    '',
    '## Status',
    `- Risk: ${projection.riskSummary}`,
    `- Validation: ${projection.validationSummary}`,
    `- Review: ${describeReviewProjection(reviewProjection)}`,
    `- Remediation: ${describeRemediationProjection(remediationProjection)}`,
    '',
    '## Checklist',
    renderChecklist(projection.checklist),
    '',
    '## Review Evidence',
    renderList(reviewProjection?.findingIds ?? []),
    '',
    '## Remediation Evidence',
    renderList(remediationProjection?.unresolvedFindingIds ?? []),
    '',
    '## Artifacts',
    renderList(projection.artifactIds),
  ].join('\n');
}

function hasBlockingReview(record: PullRequestRecord): boolean {
  return (record.reviewProjection?.blockingFindingIds.length ?? 0) > 0;
}

function hasUnresolvedRemediation(record: PullRequestRecord): boolean {
  return (record.remediationProjection?.unresolvedFindingIds.length ?? 0) > 0;
}

function createRiskSummary(record: PullRequestRecord): string {
  const blockingReviewCount =
    record.reviewProjection?.blockingFindingIds.length ?? 0;
  const unresolvedRemediationCount =
    record.remediationProjection?.unresolvedFindingIds.length ?? 0;

  if (!record.mergeReady) {
    return 'Merge blocked';
  }

  if (blockingReviewCount > 0) {
    return `Merge blocked by ${String(blockingReviewCount)} review findings`;
  }

  if (unresolvedRemediationCount > 0) {
    return `Merge blocked by ${String(unresolvedRemediationCount)} unresolved remediation findings`;
  }

  return 'Ready for merge';
}

function createValidationSummary(record: PullRequestRecord): string {
  const review = describeReviewProjection(record.reviewProjection);
  const remediation = describeRemediationProjection(
    record.remediationProjection,
  );

  if (
    record.reviewProjection === undefined &&
    record.remediationProjection === undefined
  ) {
    return record.reviewState === 'approved'
      ? 'Review approved'
      : 'Review pending';
  }

  return `${review}; ${remediation}`;
}

export function createPullRequestProjection(
  record: PullRequestRecord,
): PullRequestProjection {
  const checklist = uniqueTrimmed([
    ...uniqueTrimmed(record.labels).map((label) => `Confirm ${label}`),
    ...createReviewChecklist(record.reviewProjection),
    ...createRemediationChecklist(record.remediationProjection),
  ]);
  const projection = {
    body: record.title.trim(),
    checklist,
    riskSummary: createRiskSummary(record),
    validationSummary: createValidationSummary(record),
    artifactIds: collectProjectionArtifactIds(record),
  };

  return {
    ...projection,
    body: renderPullRequestBody(record, projection),
  };
}

export function createPullRequestRecord(
  input: PullRequestRecord,
): PullRequestRecord {
  const labels = uniqueTrimmed(input.labels);
  const reviewProjection =
    input.reviewProjection === undefined
      ? undefined
      : normalizeReviewProjection(input.reviewProjection);
  const remediationProjection =
    input.remediationProjection === undefined
      ? undefined
      : normalizeRemediationProjection(input.remediationProjection);
  const record = {
    ...input,
    branchName: createGitBranchName(input.branchName),
    baseBranch: createGitBranchName(input.baseBranch),
    title: input.title.trim(),
    labels,
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(reviewProjection === undefined ? {} : { reviewProjection }),
    ...(remediationProjection === undefined ? {} : { remediationProjection }),
    ...(input.sourceArtifactIds === undefined
      ? {}
      : { sourceArtifactIds: uniqueTrimmed(input.sourceArtifactIds) }),
  };

  return {
    ...record,
    projection:
      input.projection === undefined
        ? createPullRequestProjection(record)
        : normalizePullRequestProjection(input.projection),
  };
}

export function canMergePullRequest(input: PullRequestRecord): boolean {
  const record = createPullRequestRecord(input);
  return (
    record.mergeReady &&
    record.reviewState === 'approved' &&
    !hasBlockingReview(record) &&
    !hasUnresolvedRemediation(record)
  );
}

export function describePullRequestRecord(input: PullRequestRecord): string {
  return `PR #${String(input.prNumber)} -> ${input.title}`;
}

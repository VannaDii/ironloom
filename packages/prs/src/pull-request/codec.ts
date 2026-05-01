import * as t from 'io-ts';

export const PullRequestProjectionCodec = t.type({
  body: t.string,
  checklist: t.array(t.string),
  riskSummary: t.string,
  validationSummary: t.string,
  artifactIds: t.array(t.string),
});

export const PullRequestReviewProjectionCodec = t.type({
  summaryId: t.string,
  findingIds: t.array(t.string),
  blockingFindingIds: t.array(t.string),
  missingCriteria: t.array(t.string),
  implementationMatchesSpec: t.boolean,
});

export const PullRequestRemediationProjectionCodec = t.intersection([
  t.type({
    planId: t.string,
    successfulActions: t.array(t.string),
    failedActions: t.array(t.string),
    artifactIds: t.array(t.string),
    unresolvedFindingIds: t.array(t.string),
    complete: t.boolean,
  }),
  t.partial({
    nextAction: t.string,
  }),
]);

export const PullRequestReviewStateCodec = t.union([
  t.literal('draft'),
  t.literal('review'),
  t.literal('approved'),
  t.literal('changes-requested'),
]);

export const PullRequestRecordCodec = t.intersection([
  t.type({
    prNumber: t.number,
    branchName: t.string,
    baseBranch: t.string,
    title: t.string,
    labels: t.array(t.string),
    reviewState: PullRequestReviewStateCodec,
    mergeReady: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    projection: PullRequestProjectionCodec,
    reviewProjection: PullRequestReviewProjectionCodec,
    remediationProjection: PullRequestRemediationProjectionCodec,
    sourceArtifactIds: t.array(t.string),
  }),
]);

/** Review state tracked for a pull request. */
export type PullRequestReviewState = t.TypeOf<
  typeof PullRequestReviewStateCodec
>;

/** Rendered pull request body and validation projection. */
export type PullRequestProjection = t.TypeOf<typeof PullRequestProjectionCodec>;

/** Review summary projection attached to a pull request. */
export type PullRequestReviewProjection = t.TypeOf<
  typeof PullRequestReviewProjectionCodec
>;

/** Remediation summary projection attached to a pull request. */
export type PullRequestRemediationProjection = t.TypeOf<
  typeof PullRequestRemediationProjectionCodec
>;

/** Durable pull request lifecycle record. */
export type PullRequestRecord = t.TypeOf<typeof PullRequestRecordCodec>;

import * as t from 'io-ts';

export const GitHubActionCodec = t.union([
  t.literal('create-pr'),
  t.literal('update-pr'),
  t.literal('comment-pr'),
  t.literal('merge-pr'),
  t.literal('sync-branch'),
]);

export const GitHubHttpMethodCodec = t.union([
  t.literal('POST'),
  t.literal('PATCH'),
  t.literal('PUT'),
]);

export const GitHubSubmissionModeCodec = t.union([
  t.literal('live'),
  t.literal('dry-run'),
]);

export const GitHubActionRequestCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    action: GitHubActionCodec,
    summary: t.string,
    privileged: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    targetNumber: t.number,
    branchName: t.string,
    baseBranch: t.string,
    title: t.string,
    body: t.string,
    commentBody: t.string,
    expectedHeadSha: t.string,
  }),
]);

export const GitHubRestRequestCodec = t.type({
  method: GitHubHttpMethodCodec,
  endpoint: t.string,
  body: t.UnknownRecord,
});

export const GitHubSubmissionReceiptCodec = t.type({
  method: GitHubHttpMethodCodec,
  endpoint: t.string,
  statusCode: t.number,
  responseBody: t.unknown,
});

export const GitHubActionDecisionCodec = t.intersection([
  t.type({
    request: GitHubActionRequestCodec,
    allowed: t.boolean,
    policyDecisionId: t.string,
    submitted: t.boolean,
  }),
  t.partial({
    receipt: GitHubSubmissionReceiptCodec,
  }),
]);

export const GitHubPullRequestLifecycleStateCodec = t.union([
  t.literal('open'),
  t.literal('closed'),
  t.literal('merged'),
]);

export const GitHubCheckStateCodec = t.union([
  t.literal('pending'),
  t.literal('passing'),
  t.literal('failing'),
  t.literal('unknown'),
]);

export const GitHubReviewDecisionCodec = t.union([
  t.literal('approved'),
  t.literal('changes-requested'),
  t.literal('review-required'),
  t.literal('unknown'),
]);

export const GitHubIssueSpecLinkStatusCodec = t.union([
  t.literal('planned'),
  t.literal('in-progress'),
  t.literal('blocked'),
  t.literal('complete'),
]);

export const GitHubRepositoryStateCodec = t.type({
  repoFullName: t.string,
  defaultBranch: t.string,
  protectedBranches: t.array(t.string),
  openPullRequestNumbers: t.array(t.number),
  linkedIssueNumbers: t.array(t.number),
  updatedAt: t.string,
});

export const GitHubPullRequestStateCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    number: t.number,
    title: t.string,
    state: GitHubPullRequestLifecycleStateCodec,
    headBranch: t.string,
    baseBranch: t.string,
    headSha: t.string,
    issueNumbers: t.array(t.number),
    labels: t.array(t.string),
    checkState: GitHubCheckStateCodec,
    reviewDecision: GitHubReviewDecisionCodec,
    mergeable: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    specId: t.string,
  }),
]);

export const GitHubIssueSpecLinkCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    issueNumber: t.number,
    specId: t.string,
    pullRequestNumber: t.number,
    status: GitHubIssueSpecLinkStatusCodec,
    updatedAt: t.string,
  }),
  t.partial({
    threadId: t.string,
  }),
]);

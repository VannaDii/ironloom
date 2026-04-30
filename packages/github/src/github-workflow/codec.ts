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

import * as t from 'io-ts';

import { GitBranchNameCodec, IsoTimestampCodec } from '@vannadii/devplat-core';

import {
  GITHUB_ACTION_COMMENT_PR,
  GITHUB_ACTION_CREATE_PR,
  GITHUB_ACTION_MERGE_PR,
  GITHUB_ACTION_SYNC_BRANCH,
  GITHUB_ACTION_UPDATE_PR,
  GITHUB_HTTP_METHOD_PATCH,
  GITHUB_HTTP_METHOD_POST,
  GITHUB_HTTP_METHOD_PUT,
  GITHUB_SUBMISSION_MODE_DRY_RUN,
  GITHUB_SUBMISSION_MODE_LIVE,
} from './constants.js';

/**
 * Codec for GitHub workflow actions.
 */
export const GitHubActionCodec = t.union([
  t.literal(GITHUB_ACTION_CREATE_PR),
  t.literal(GITHUB_ACTION_UPDATE_PR),
  t.literal(GITHUB_ACTION_COMMENT_PR),
  t.literal(GITHUB_ACTION_MERGE_PR),
  t.literal(GITHUB_ACTION_SYNC_BRANCH),
]);

/**
 * Codec for HTTP methods used by GitHub workflow requests.
 */
export const GitHubHttpMethodCodec = t.union([
  t.literal(GITHUB_HTTP_METHOD_POST),
  t.literal(GITHUB_HTTP_METHOD_PATCH),
  t.literal(GITHUB_HTTP_METHOD_PUT),
]);

/**
 * Codec for GitHub submission modes.
 */
export const GitHubSubmissionModeCodec = t.union([
  t.literal(GITHUB_SUBMISSION_MODE_LIVE),
  t.literal(GITHUB_SUBMISSION_MODE_DRY_RUN),
]);

/**
 * Codec for a requested GitHub workflow operation.
 */
export const GitHubActionRequestCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    action: GitHubActionCodec,
    summary: t.string,
    privileged: t.boolean,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    targetNumber: t.number,
    branchName: GitBranchNameCodec,
    baseBranch: GitBranchNameCodec,
    title: t.string,
    body: t.string,
    commentBody: t.string,
    expectedHeadSha: t.string,
  }),
]);

/**
 * Codec for the concrete REST request submitted to GitHub.
 */
export const GitHubRestRequestCodec = t.type({
  method: GitHubHttpMethodCodec,
  endpoint: t.string,
  body: t.UnknownRecord,
});

/**
 * Codec for GitHub REST submission receipts.
 */
export const GitHubSubmissionReceiptCodec = t.type({
  method: GitHubHttpMethodCodec,
  endpoint: t.string,
  statusCode: t.number,
  responseBody: t.unknown,
});

/**
 * Codec for policy and submission results around a GitHub action.
 */
export const GitHubActionDecisionCodec = t.intersection([
  t.type({
    request: GitHubActionRequestCodec,
    allowed: t.boolean,
    policyDecisionId: t.string,
    telemetryEventId: t.string,
    submitted: t.boolean,
  }),
  t.partial({
    receipt: GitHubSubmissionReceiptCodec,
  }),
]);

/**
 * Codec for GitHub pull request lifecycle states.
 */
export const GitHubPullRequestLifecycleStateCodec = t.union([
  t.literal('open'),
  t.literal('closed'),
  t.literal('merged'),
]);

/**
 * Codec for normalized GitHub check states.
 */
export const GitHubCheckStateCodec = t.union([
  t.literal('pending'),
  t.literal('passing'),
  t.literal('failing'),
  t.literal('unknown'),
]);

/**
 * Codec for normalized GitHub review decisions.
 */
export const GitHubReviewDecisionCodec = t.union([
  t.literal('approved'),
  t.literal('changes-requested'),
  t.literal('review-required'),
  t.literal('unknown'),
]);

/**
 * Codec for issue-to-spec link status values.
 */
export const GitHubIssueSpecLinkStatusCodec = t.union([
  t.literal('planned'),
  t.literal('in-progress'),
  t.literal('blocked'),
  t.literal('complete'),
]);

/**
 * Codec for repository state snapshots.
 */
export const GitHubRepositoryStateCodec = t.type({
  repoFullName: t.string,
  defaultBranch: GitBranchNameCodec,
  protectedBranches: t.array(GitBranchNameCodec),
  openPullRequestNumbers: t.array(t.number),
  linkedIssueNumbers: t.array(t.number),
  updatedAt: IsoTimestampCodec,
});

/**
 * Codec for pull request state snapshots.
 */
export const GitHubPullRequestStateCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    number: t.number,
    title: t.string,
    state: GitHubPullRequestLifecycleStateCodec,
    headBranch: GitBranchNameCodec,
    baseBranch: GitBranchNameCodec,
    headSha: t.string,
    issueNumbers: t.array(t.number),
    labels: t.array(t.string),
    checkState: GitHubCheckStateCodec,
    reviewDecision: GitHubReviewDecisionCodec,
    mergeable: t.boolean,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    specId: t.string,
  }),
]);

/**
 * Codec for issue/spec/pull-request relationship records.
 */
export const GitHubIssueSpecLinkCodec = t.intersection([
  t.type({
    repoFullName: t.string,
    issueNumber: t.number,
    specId: t.string,
    pullRequestNumber: t.number,
    status: GitHubIssueSpecLinkStatusCodec,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    threadId: t.string,
  }),
]);

/** GitHub workflow action DevPlat may submit. */
export type GitHubAction = t.TypeOf<typeof GitHubActionCodec>;

/** HTTP method used by GitHub REST calls. */
export type GitHubHttpMethod = t.TypeOf<typeof GitHubHttpMethodCodec>;

/** Submission mode for a GitHub workflow operation. */
export type GitHubSubmissionMode = t.TypeOf<typeof GitHubSubmissionModeCodec>;

/** Requested GitHub workflow operation. */
export type GitHubActionRequest = t.TypeOf<typeof GitHubActionRequestCodec>;

/** Concrete GitHub REST request. */
export type GitHubRestRequest = t.TypeOf<typeof GitHubRestRequestCodec>;

/** Receipt returned after a GitHub REST submission. */
export type GitHubSubmissionReceipt = t.TypeOf<
  typeof GitHubSubmissionReceiptCodec
>;

/** Policy and submission decision for a GitHub action. */
export type GitHubActionDecision = t.TypeOf<typeof GitHubActionDecisionCodec>;

/** Pull request lifecycle state from GitHub. */
export type GitHubPullRequestLifecycleState = t.TypeOf<
  typeof GitHubPullRequestLifecycleStateCodec
>;

/** Normalized GitHub check state. */
export type GitHubCheckState = t.TypeOf<typeof GitHubCheckStateCodec>;

/** Normalized GitHub review decision. */
export type GitHubReviewDecision = t.TypeOf<typeof GitHubReviewDecisionCodec>;

/** Link status between a GitHub issue and DevPlat spec. */
export type GitHubIssueSpecLinkStatus = t.TypeOf<
  typeof GitHubIssueSpecLinkStatusCodec
>;

/** Repository state snapshot from GitHub. */
export type GitHubRepositoryState = t.TypeOf<typeof GitHubRepositoryStateCodec>;

/** Pull request state snapshot from GitHub. */
export type GitHubPullRequestState = t.TypeOf<
  typeof GitHubPullRequestStateCodec
>;

/** Link record joining GitHub issues, specs, and pull requests. */
export type GitHubIssueSpecLink = t.TypeOf<typeof GitHubIssueSpecLinkCodec>;

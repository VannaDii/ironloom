import type * as t from 'io-ts';

import type {
  GitHubActionCodec,
  GitHubActionDecisionCodec,
  GitHubActionRequestCodec,
  GitHubCheckStateCodec,
  GitHubHttpMethodCodec,
  GitHubIssueSpecLinkCodec,
  GitHubIssueSpecLinkStatusCodec,
  GitHubPullRequestLifecycleStateCodec,
  GitHubPullRequestStateCodec,
  GitHubRepositoryStateCodec,
  GitHubReviewDecisionCodec,
  GitHubRestRequestCodec,
  GitHubSubmissionModeCodec,
  GitHubSubmissionReceiptCodec,
} from './codec.js';

export type GitHubAction = t.TypeOf<typeof GitHubActionCodec>;

export type GitHubHttpMethod = t.TypeOf<typeof GitHubHttpMethodCodec>;

export type GitHubSubmissionMode = t.TypeOf<typeof GitHubSubmissionModeCodec>;

export type GitHubActionRequest = t.TypeOf<typeof GitHubActionRequestCodec>;

export type GitHubRestRequest = t.TypeOf<typeof GitHubRestRequestCodec>;

export type GitHubSubmissionReceipt = t.TypeOf<
  typeof GitHubSubmissionReceiptCodec
>;

export type GitHubActionDecision = t.TypeOf<typeof GitHubActionDecisionCodec>;

export type GitHubPullRequestLifecycleState = t.TypeOf<
  typeof GitHubPullRequestLifecycleStateCodec
>;

export type GitHubCheckState = t.TypeOf<typeof GitHubCheckStateCodec>;

export type GitHubReviewDecision = t.TypeOf<typeof GitHubReviewDecisionCodec>;

export type GitHubIssueSpecLinkStatus = t.TypeOf<
  typeof GitHubIssueSpecLinkStatusCodec
>;

export type GitHubRepositoryState = t.TypeOf<typeof GitHubRepositoryStateCodec>;

export type GitHubPullRequestState = t.TypeOf<
  typeof GitHubPullRequestStateCodec
>;

export type GitHubIssueSpecLink = t.TypeOf<typeof GitHubIssueSpecLinkCodec>;

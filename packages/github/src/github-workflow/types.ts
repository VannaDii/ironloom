import type * as t from 'io-ts';

import type {
  GitHubActionCodec,
  GitHubActionDecisionCodec,
  GitHubActionRequestCodec,
  GitHubHttpMethodCodec,
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

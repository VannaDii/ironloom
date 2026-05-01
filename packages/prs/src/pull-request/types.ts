import type * as t from 'io-ts';

import type {
  PullRequestProjectionCodec,
  PullRequestRecordCodec,
  PullRequestRemediationProjectionCodec,
  PullRequestReviewProjectionCodec,
  PullRequestReviewStateCodec,
} from './codec.js';

export type PullRequestReviewState = t.TypeOf<
  typeof PullRequestReviewStateCodec
>;

export type PullRequestProjection = t.TypeOf<typeof PullRequestProjectionCodec>;

export type PullRequestReviewProjection = t.TypeOf<
  typeof PullRequestReviewProjectionCodec
>;

export type PullRequestRemediationProjection = t.TypeOf<
  typeof PullRequestRemediationProjectionCodec
>;

export type PullRequestRecord = t.TypeOf<typeof PullRequestRecordCodec>;

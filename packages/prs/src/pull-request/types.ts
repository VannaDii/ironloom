import type * as t from 'io-ts';

import type {
  PullRequestProjectionCodec,
  PullRequestRecordCodec,
  PullRequestReviewStateCodec,
} from './codec.js';

export type PullRequestReviewState = t.TypeOf<
  typeof PullRequestReviewStateCodec
>;

export type PullRequestProjection = t.TypeOf<typeof PullRequestProjectionCodec>;

export type PullRequestRecord = t.TypeOf<typeof PullRequestRecordCodec>;

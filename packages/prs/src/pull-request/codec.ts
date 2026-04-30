import * as t from 'io-ts';

import type { PullRequestRecord } from './types.js';

export const PullRequestProjectionCodec = t.type({
  body: t.string,
  checklist: t.array(t.string),
  riskSummary: t.string,
  validationSummary: t.string,
  artifactIds: t.array(t.string),
});

export const PullRequestRecordCodec = t.intersection([
  t.type({
    prNumber: t.number,
    branchName: t.string,
    baseBranch: t.string,
    title: t.string,
    labels: t.array(t.string),
    reviewState: t.union([
      t.literal('draft'),
      t.literal('review'),
      t.literal('approved'),
      t.literal('changes-requested'),
    ]),
    mergeReady: t.boolean,
    updatedAt: t.string,
  }),
  t.partial({
    projection: PullRequestProjectionCodec,
    sourceArtifactIds: t.array(t.string),
  }),
]);

export type _PullRequestRecordExact =
  t.TypeOf<typeof PullRequestRecordCodec> extends PullRequestRecord
    ? PullRequestRecord extends t.TypeOf<typeof PullRequestRecordCodec>
      ? true
      : never
    : never;

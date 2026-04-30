import * as t from 'io-ts';

import type { SpecRecord } from './types.js';

export const SpecRevisionCodec = t.intersection([
  t.type({
    version: t.number,
    summary: t.string,
    updatedAt: t.string,
  }),
  t.partial({
    artifactId: t.string,
  }),
]);

export const SpecRecordCodec = t.intersection([
  t.type({
    specId: t.string,
    researchId: t.string,
    title: t.string,
    objective: t.string,
    acceptanceCriteria: t.array(t.string),
    approvalState: t.union([
      t.literal('draft'),
      t.literal('review'),
      t.literal('approved'),
    ]),
    version: t.number,
    updatedAt: t.string,
  }),
  t.partial({
    revisionHistory: t.array(SpecRevisionCodec),
    renderedPullRequestBody: t.string,
    sourceArtifactIds: t.array(t.string),
  }),
]);

export type _SpecRecordExact =
  t.TypeOf<typeof SpecRecordCodec> extends SpecRecord
    ? SpecRecord extends t.TypeOf<typeof SpecRecordCodec>
      ? true
      : never
    : never;

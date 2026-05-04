import * as t from 'io-ts';

import { IsoTimestampCodec } from '@vannadii/devplat-core';

/**
 * Codec for versioned specification revision metadata.
 */
export const SpecRevisionCodec = t.intersection([
  t.type({
    version: t.number,
    summary: t.string,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    revisionId: t.string,
    previousVersion: t.number,
    approvalStateBeforeUpdate: t.string,
    artifactId: t.string,
  }),
]);

/**
 * Codec for specification approval states.
 */
export const SpecApprovalStateCodec = t.union([
  t.literal('draft'),
  t.literal('review'),
  t.literal('approved'),
]);

/**
 * Codec for durable specification records.
 */
export const SpecRecordCodec = t.intersection([
  t.type({
    specId: t.string,
    researchId: t.string,
    title: t.string,
    objective: t.string,
    acceptanceCriteria: t.array(t.string),
    approvalState: SpecApprovalStateCodec,
    version: t.number,
    updatedAt: IsoTimestampCodec,
  }),
  t.partial({
    revisionHistory: t.array(SpecRevisionCodec),
    renderedPullRequestBody: t.string,
    sourceArtifactIds: t.array(t.string),
  }),
]);

/** Approval state for a specification. */
export type SpecApprovalState = t.TypeOf<typeof SpecApprovalStateCodec>;

/** Versioned spec revision metadata. */
export type SpecRevision = t.TypeOf<typeof SpecRevisionCodec>;

/** Durable specification record used by planning and PR rendering. */
export type SpecRecord = t.TypeOf<typeof SpecRecordCodec>;

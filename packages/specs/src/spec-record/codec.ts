import * as t from 'io-ts';

export const SpecRevisionCodec = t.intersection([
  t.type({
    version: t.number,
    summary: t.string,
    updatedAt: t.string,
  }),
  t.partial({
    revisionId: t.string,
    previousVersion: t.number,
    approvalStateBeforeUpdate: t.string,
    artifactId: t.string,
  }),
]);

export const SpecApprovalStateCodec = t.union([
  t.literal('draft'),
  t.literal('review'),
  t.literal('approved'),
]);

export const SpecRecordCodec = t.intersection([
  t.type({
    specId: t.string,
    researchId: t.string,
    title: t.string,
    objective: t.string,
    acceptanceCriteria: t.array(t.string),
    approvalState: SpecApprovalStateCodec,
    version: t.number,
    updatedAt: t.string,
  }),
  t.partial({
    revisionHistory: t.array(SpecRevisionCodec),
    renderedPullRequestBody: t.string,
    sourceArtifactIds: t.array(t.string),
  }),
]);

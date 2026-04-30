import * as t from 'io-ts';

export const SliceDependencyEdgeCodec = t.type({
  fromSliceId: t.string,
  toSliceId: t.string,
});

export const SliceDependencyGraphCodec = t.type({
  sliceId: t.string,
  edges: t.array(SliceDependencyEdgeCodec),
  blockedBy: t.array(t.string),
});

export const SliceWorkPacketCodec = t.type({
  branchName: t.string,
  taskIds: t.array(t.string),
  estimatedPullRequestCount: t.number,
});

export const SliceSizeCodec = t.union([
  t.literal('small'),
  t.literal('medium'),
  t.literal('large'),
]);

export const SlicePlanCodec = t.intersection([
  t.type({
    sliceId: t.string,
    specId: t.string,
    title: t.string,
    dependsOn: t.array(t.string),
    acceptanceCriteria: t.array(t.string),
    doneConditions: t.array(t.string),
    size: SliceSizeCodec,
    updatedAt: t.string,
  }),
  t.partial({
    dependencyGraph: SliceDependencyGraphCodec,
    workPacket: SliceWorkPacketCodec,
  }),
]);

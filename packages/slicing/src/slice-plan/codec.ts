import * as t from 'io-ts';

export const SliceDependencyEdgeCodec = t.type({
  fromSliceId: t.string,
  toSliceId: t.string,
});

export const SliceDependencyGraphCodec = t.type({
  sliceId: t.string,
  graphId: t.string,
  generatedAt: t.string,
  edges: t.array(SliceDependencyEdgeCodec),
  blockedBy: t.array(t.string),
  dependencyCount: t.number,
});

export const SliceWorkPacketCodec = t.type({
  packetId: t.string,
  branchName: t.string,
  taskIds: t.array(t.string),
  estimatedTaskCount: t.number,
  estimatedPullRequestCount: t.number,
  pullRequestTitle: t.string,
  reviewFocus: t.array(t.string),
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

/** T-shirt size used to keep slices PR-sized. */
export type SliceSize = t.TypeOf<typeof SliceSizeCodec>;

/** Directed dependency edge between slices. */
export type SliceDependencyEdge = t.TypeOf<typeof SliceDependencyEdgeCodec>;

/** Dependency graph for a slice plan. */
export type SliceDependencyGraph = t.TypeOf<typeof SliceDependencyGraphCodec>;

/** Work packet projected from a slice plan. */
export type SliceWorkPacket = t.TypeOf<typeof SliceWorkPacketCodec>;

/** Durable slice plan derived from a specification. */
export type SlicePlan = t.TypeOf<typeof SlicePlanCodec>;

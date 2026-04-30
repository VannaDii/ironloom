import * as t from 'io-ts';

import type { SlicePlan } from './types.js';

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

export const SlicePlanCodec = t.intersection([
  t.type({
    sliceId: t.string,
    specId: t.string,
    title: t.string,
    dependsOn: t.array(t.string),
    acceptanceCriteria: t.array(t.string),
    doneConditions: t.array(t.string),
    size: t.union([
      t.literal('small'),
      t.literal('medium'),
      t.literal('large'),
    ]),
    updatedAt: t.string,
  }),
  t.partial({
    dependencyGraph: SliceDependencyGraphCodec,
    workPacket: SliceWorkPacketCodec,
  }),
]);

export type _SlicePlanExact =
  t.TypeOf<typeof SlicePlanCodec> extends SlicePlan
    ? SlicePlan extends t.TypeOf<typeof SlicePlanCodec>
      ? true
      : never
    : never;

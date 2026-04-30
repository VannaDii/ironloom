import type * as t from 'io-ts';

import type {
  SliceDependencyEdgeCodec,
  SliceDependencyGraphCodec,
  SlicePlanCodec,
  SliceSizeCodec,
  SliceWorkPacketCodec,
} from './codec.js';

export type SliceSize = t.TypeOf<typeof SliceSizeCodec>;

export type SliceDependencyEdge = t.TypeOf<typeof SliceDependencyEdgeCodec>;

export type SliceDependencyGraph = t.TypeOf<typeof SliceDependencyGraphCodec>;

export type SliceWorkPacket = t.TypeOf<typeof SliceWorkPacketCodec>;

export type SlicePlan = t.TypeOf<typeof SlicePlanCodec>;

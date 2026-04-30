import type * as t from 'io-ts';

import type {
  MergeDecisionArtifactCodec,
  MergeDecisionPayloadCodec,
  MergeStrategyCodec,
} from './codec.js';

export type MergeStrategy = t.TypeOf<typeof MergeStrategyCodec>;

export type MergeDecisionPayload = t.TypeOf<typeof MergeDecisionPayloadCodec>;

export type MergeDecisionArtifact = t.TypeOf<typeof MergeDecisionArtifactCodec>;

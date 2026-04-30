import type * as t from 'io-ts';

import type {
  ResearchBriefCodec,
  ResearchCapabilityComparisonCodec,
  ResearchFeasibilityCodec,
  ResearchSourceAttributionCodec,
} from './codec.js';

export type ResearchSourceAttribution = t.TypeOf<
  typeof ResearchSourceAttributionCodec
>;

export type ResearchCapabilityComparison = t.TypeOf<
  typeof ResearchCapabilityComparisonCodec
>;

export type ResearchFeasibility = t.TypeOf<typeof ResearchFeasibilityCodec>;

export type ResearchBrief = t.TypeOf<typeof ResearchBriefCodec>;

import type { ArtifactEnvelope } from '../artifact-envelope/types.js';

export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export interface MergeDecisionPayload {
  decisionId: string;
  prNumber: number;
  actorId: string;
  mergeStrategy: MergeStrategy;
  approved: boolean;
  rationale: string;
  blockingFindings: string[];
}

export type MergeDecisionArtifact = ArtifactEnvelope<
  MergeDecisionPayload,
  'merge-decision'
>;

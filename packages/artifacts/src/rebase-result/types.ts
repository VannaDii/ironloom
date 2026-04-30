import type { ArtifactEnvelope } from '../artifact-envelope/types.js';

export interface RebaseResultPayload {
  resultId: string;
  mergedPrNumber: number;
  baseBranch: string;
  branchName: string;
  rebased: boolean;
  conflictsDetected: boolean;
  details: string;
}

export type RebaseResultArtifact = ArtifactEnvelope<
  RebaseResultPayload,
  'rebase-result'
>;

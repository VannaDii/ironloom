import {
  createMergeDecisionArtifact,
  describeMergeDecisionArtifact,
} from './logic.js';
import type { MergeDecisionArtifact } from './codec.js';

/** Merge decision artifact service service. */
export class MergeDecisionArtifactService {
  /** Executes the service operation. */
  public execute(input: MergeDecisionArtifact): MergeDecisionArtifact {
    return createMergeDecisionArtifact(input);
  }

  /** Describes the service result for operators. */
  public explain(input: MergeDecisionArtifact): string {
    return describeMergeDecisionArtifact(input);
  }
}

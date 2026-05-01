import {
  createMergeDecisionArtifact,
  describeMergeDecisionArtifact,
} from './logic.js';
import type { MergeDecisionArtifact } from './codec.js';

export class MergeDecisionArtifactService {
  public execute(input: MergeDecisionArtifact): MergeDecisionArtifact {
    return createMergeDecisionArtifact(input);
  }

  public explain(input: MergeDecisionArtifact): string {
    return describeMergeDecisionArtifact(input);
  }
}

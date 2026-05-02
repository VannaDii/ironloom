import {
  createRebaseResultArtifact,
  describeRebaseResultArtifact,
} from './logic.js';
import type { RebaseResultArtifact } from './codec.js';

export class RebaseResultArtifactService {
  public execute(input: RebaseResultArtifact): RebaseResultArtifact {
    return createRebaseResultArtifact(input);
  }

  public explain(input: RebaseResultArtifact): string {
    return describeRebaseResultArtifact(input);
  }
}

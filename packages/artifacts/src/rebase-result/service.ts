import {
  createRebaseResultArtifact,
  describeRebaseResultArtifact,
} from './logic.js';
import type { RebaseResultArtifact } from './codec.js';

/** Rebase result artifact service. */
export class RebaseResultArtifactService {
  /** Executes the service operation. */
  public execute(input: RebaseResultArtifact): RebaseResultArtifact {
    return createRebaseResultArtifact(input);
  }

  /** Describes the service result for operators. */
  public explain(input: RebaseResultArtifact): string {
    return describeRebaseResultArtifact(input);
  }
}

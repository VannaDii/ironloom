import {
  describeValidatedArtifact,
  validateArtifact,
  type KnownArtifact,
} from './logic.js';
import type { DevplatResult } from '@vannadii/devplat-core';

export class ArtifactValidationService {
  public execute(input: unknown): DevplatResult<KnownArtifact> {
    return validateArtifact(input);
  }

  public explain(input: KnownArtifact): string {
    return describeValidatedArtifact(input);
  }
}

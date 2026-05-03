import type { DevplatResult } from '@vannadii/devplat-core';

import {
  type ArtifactValidationOptions,
  describeValidatedArtifact,
  validateArtifact,
  type KnownArtifact,
} from './logic.js';

/** Service shell for artifact validation and operator-facing summaries. */
export class ArtifactValidationService {
  /** Validates an artifact with optional active registry constraints. */
  public execute(
    input: unknown,
    options: ArtifactValidationOptions = {},
  ): DevplatResult<KnownArtifact> {
    return validateArtifact(input, options);
  }

  /** Describes a validated artifact for operator-facing output. */
  public explain(input: KnownArtifact): string {
    return describeValidatedArtifact(input);
  }
}

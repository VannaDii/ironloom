import type { SupportedArtifactType } from '@vannadii/devplat-core';

import { createArtifactEnvelope, describeArtifactEnvelope } from './logic.js';
import type { ArtifactEnvelope } from './codec.js';

/** Artifact envelope service service. */
export class ArtifactEnvelopeService {
  /** Executes the service operation. */
  public execute<
    TPayload extends object,
    TArtifactType extends SupportedArtifactType,
  >(
    input: ArtifactEnvelope<TPayload, TArtifactType>,
  ): ArtifactEnvelope<TPayload, TArtifactType> {
    return createArtifactEnvelope(input);
  }

  /** Describes the service result for operators. */
  public explain<
    TPayload extends object,
    TArtifactType extends SupportedArtifactType,
  >(input: ArtifactEnvelope<TPayload, TArtifactType>): string {
    return describeArtifactEnvelope(input);
  }
}

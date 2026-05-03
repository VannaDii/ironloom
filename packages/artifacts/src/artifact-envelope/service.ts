import type { SupportedArtifactType } from '@vannadii/devplat-core';

import { createArtifactEnvelope, describeArtifactEnvelope } from './logic.js';
import type { ArtifactEnvelope } from './codec.js';

export class ArtifactEnvelopeService {
  public execute<
    TPayload extends object,
    TArtifactType extends SupportedArtifactType,
  >(
    input: ArtifactEnvelope<TPayload, TArtifactType>,
  ): ArtifactEnvelope<TPayload, TArtifactType> {
    return createArtifactEnvelope(input);
  }

  public explain<
    TPayload extends object,
    TArtifactType extends SupportedArtifactType,
  >(input: ArtifactEnvelope<TPayload, TArtifactType>): string {
    return describeArtifactEnvelope(input);
  }
}

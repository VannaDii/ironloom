import { createArtifactEnvelope, describeArtifactEnvelope } from './logic.js';
import type { ArtifactEnvelope } from './codec.js';

export class ArtifactEnvelopeService {
  public execute<TPayload extends object>(
    input: ArtifactEnvelope<TPayload>,
  ): ArtifactEnvelope<TPayload> {
    return createArtifactEnvelope(input);
  }

  public explain<TPayload extends object>(
    input: ArtifactEnvelope<TPayload>,
  ): string {
    return describeArtifactEnvelope(input);
  }
}

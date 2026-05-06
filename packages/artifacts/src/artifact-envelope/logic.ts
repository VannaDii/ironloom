import {
  appendTrace,
  type SupportedArtifactType,
} from '@vannadii/devplat-core';

import type { ArtifactEnvelope } from './codec.js';

/** Creates artifact envelope. */
export function createArtifactEnvelope<
  TPayload extends object,
  TArtifactType extends SupportedArtifactType,
>(
  input: ArtifactEnvelope<TPayload, TArtifactType>,
): ArtifactEnvelope<TPayload, TArtifactType> {
  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `artifact:${input.artifactType}`,
  );
}

/** Describes artifact envelope. */
export function describeArtifactEnvelope<
  TPayload extends object,
  TArtifactType extends SupportedArtifactType,
>(input: ArtifactEnvelope<TPayload, TArtifactType>): string {
  return `${input.artifactType}@v${String(input.version)} -> ${input.summary}`;
}

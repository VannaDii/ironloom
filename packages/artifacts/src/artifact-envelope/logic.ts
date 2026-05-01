import { appendTrace } from '@vannadii/devplat-core';

import type { ArtifactEnvelope } from './codec.js';

export function createArtifactEnvelope<
  TPayload extends object,
  TArtifactType extends string,
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

export function describeArtifactEnvelope<
  TPayload extends object,
  TArtifactType extends string,
>(input: ArtifactEnvelope<TPayload, TArtifactType>): string {
  return `${input.artifactType}@v${String(input.version)} -> ${input.summary}`;
}

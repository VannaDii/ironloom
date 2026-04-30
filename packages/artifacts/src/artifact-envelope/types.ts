import type { LifecycleStatus } from '@vannadii/devplat-core';

export interface ArtifactEnvelope<
  TPayload extends object = Record<string, unknown>,
  TArtifactType extends string = string,
> {
  id: string;
  artifactType: TArtifactType;
  version: 1;
  summary: string;
  status: LifecycleStatus;
  trace: string[];
  updatedAt: string;
  migration?: {
    schemaVersion: 1;
    previousArtifactId?: string;
    migratedAt?: string;
  };
  payload: TPayload;
}

export type ArtifactEnvelopeSchema = ArtifactEnvelope;

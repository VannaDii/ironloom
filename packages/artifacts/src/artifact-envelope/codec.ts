import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
  SupportedArtifactTypeCodec,
  type SupportedArtifactType,
} from '@vannadii/devplat-core';

import {
  ARTIFACT_ENVELOPE_MIGRATION_SCHEMA_VERSION,
  ARTIFACT_ENVELOPE_VERSION,
} from './constants.js';

/**
 * Codec for the generic artifact envelope persisted around lifecycle payloads.
 */
export const ArtifactEnvelopeCodec = t.intersection([
  t.type({
    id: t.string,
    artifactType: SupportedArtifactTypeCodec,
    version: t.literal(ARTIFACT_ENVELOPE_VERSION),
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    payload: t.UnknownRecord,
  }),
  t.partial({
    migration: t.intersection([
      t.type({
        schemaVersion: t.literal(ARTIFACT_ENVELOPE_MIGRATION_SCHEMA_VERSION),
      }),
      t.partial({
        previousArtifactId: t.string,
        migratedAt: IsoTimestampCodec,
      }),
    ]),
  }),
]);

/**
 * Generic artifact envelope type derived from the envelope codec.
 */
type ArtifactEnvelopeBase = t.TypeOf<typeof ArtifactEnvelopeCodec>;

/**
 * Generic artifact envelope with typed payload and artifact type refinements.
 */
export type ArtifactEnvelope<
  TPayload extends object = Record<string, unknown>,
  TArtifactType extends SupportedArtifactType = SupportedArtifactType,
> = Omit<ArtifactEnvelopeBase, 'artifactType' | 'payload'> & {
  artifactType: TArtifactType;
  payload: TPayload;
};

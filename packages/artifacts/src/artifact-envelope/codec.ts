import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const ArtifactEnvelopeCodec = t.intersection([
  t.type({
    id: t.string,
    artifactType: t.string,
    version: t.literal(1),
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    payload: t.UnknownRecord,
  }),
  t.partial({
    migration: t.intersection([
      t.type({
        schemaVersion: t.literal(1),
      }),
      t.partial({
        previousArtifactId: t.string,
        migratedAt: t.string,
      }),
    ]),
  }),
]);

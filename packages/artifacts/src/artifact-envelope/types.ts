import type * as t from 'io-ts';

import type { ArtifactEnvelopeCodec } from './codec.js';

type ArtifactEnvelopeBase = t.TypeOf<typeof ArtifactEnvelopeCodec>;

export type ArtifactEnvelope<
  TPayload extends object = Record<string, unknown>,
  TArtifactType extends string = string,
> = Omit<ArtifactEnvelopeBase, 'artifactType' | 'payload'> & {
  artifactType: TArtifactType;
  payload: TPayload;
};

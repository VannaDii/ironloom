import type * as t from 'io-ts';

import type {
  RebaseResultArtifactCodec,
  RebaseResultPayloadCodec,
} from './codec.js';

export type RebaseResultPayload = t.TypeOf<typeof RebaseResultPayloadCodec>;

export type RebaseResultArtifact = t.TypeOf<typeof RebaseResultArtifactCodec>;

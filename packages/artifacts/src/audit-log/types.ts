import type * as t from 'io-ts';

import type { AuditLogArtifactCodec, AuditLogPayloadCodec } from './codec.js';

export type AuditLogPayload = t.TypeOf<typeof AuditLogPayloadCodec>;

export type AuditLogArtifact = t.TypeOf<typeof AuditLogArtifactCodec>;

import * as t from 'io-ts';

import {
  ARTIFACT_TYPE_AUDIT_LOG,
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

import { AUDIT_LOG_ARTIFACT_VERSION } from './constants.js';

/**
 * Codec for audit details attached to a lifecycle-changing action.
 */
export const AuditLogPayloadCodec = t.type({
  auditId: t.string,
  actorId: t.string,
  action: t.string,
  scope: t.string,
  details: t.UnknownRecord,
});

/**
 * Codec for audit log artifacts.
 */
export const AuditLogArtifactCodec = t.type({
  id: t.string,
  artifactType: t.literal(ARTIFACT_TYPE_AUDIT_LOG),
  version: t.literal(AUDIT_LOG_ARTIFACT_VERSION),
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: IsoTimestampCodec,
  payload: AuditLogPayloadCodec,
});

/**
 * Audit log payload derived from the source codec.
 */
export type AuditLogPayload = t.TypeOf<typeof AuditLogPayloadCodec>;

/**
 * Audit log artifact derived from the source codec.
 */
export type AuditLogArtifact = t.TypeOf<typeof AuditLogArtifactCodec>;

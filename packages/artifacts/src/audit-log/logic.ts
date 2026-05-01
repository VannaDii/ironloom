import { ARTIFACT_TYPE_AUDIT_LOG } from '@vannadii/devplat-core';

import {
  createArtifactEnvelope,
  describeArtifactEnvelope,
} from '../artifact-envelope/logic.js';
import type { AuditLogArtifact } from './codec.js';
import { AUDIT_LOG_ARTIFACT_VERSION } from './constants.js';

/**
 * Normalizes an audit log artifact before persistence.
 */
export function createAuditLogArtifact(
  input: AuditLogArtifact,
): AuditLogArtifact {
  return createArtifactEnvelope({
    ...input,
    artifactType: ARTIFACT_TYPE_AUDIT_LOG,
    version: AUDIT_LOG_ARTIFACT_VERSION,
    payload: {
      ...input.payload,
      auditId: input.payload.auditId.trim(),
      actorId: input.payload.actorId.trim(),
      action: input.payload.action.trim(),
      scope: input.payload.scope.trim(),
    },
  });
}

/**
 * Describes an audit log artifact for status and validation output.
 */
export function describeAuditLogArtifact(input: AuditLogArtifact): string {
  return `${describeArtifactEnvelope(input)} :: ${input.payload.scope}:${input.payload.action}`;
}

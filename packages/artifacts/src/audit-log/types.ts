import type { ArtifactEnvelope } from '../artifact-envelope/types.js';

export interface AuditLogPayload {
  auditId: string;
  actorId: string;
  action: string;
  scope: string;
  details: Record<string, unknown>;
}

export type AuditLogArtifact = ArtifactEnvelope<AuditLogPayload, 'audit-log'>;

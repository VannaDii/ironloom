import { createAuditLogArtifact, describeAuditLogArtifact } from './logic.js';
import type { AuditLogArtifact } from './codec.js';

/** Audit log artifact service. */
export class AuditLogArtifactService {
  /** Executes the service operation. */
  public execute(input: AuditLogArtifact): AuditLogArtifact {
    return createAuditLogArtifact(input);
  }

  /** Describes the service result for operators. */
  public explain(input: AuditLogArtifact): string {
    return describeAuditLogArtifact(input);
  }
}

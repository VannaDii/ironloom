import { createAuditLogArtifact, describeAuditLogArtifact } from './logic.js';
import type { AuditLogArtifact } from './codec.js';

export class AuditLogArtifactService {
  public execute(input: AuditLogArtifact): AuditLogArtifact {
    return createAuditLogArtifact(input);
  }

  public explain(input: AuditLogArtifact): string {
    return describeAuditLogArtifact(input);
  }
}

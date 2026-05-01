import type { ArtifactEnvelope } from '../artifact-envelope/codec.js';
import type { ApprovalRecordArtifact } from '../approval-record/codec.js';
import type { AuditLogArtifact } from '../audit-log/codec.js';
import type { MergeDecisionArtifact } from '../merge-decision/codec.js';
import type { RebaseResultArtifact } from '../rebase-result/codec.js';

export type KnownArtifact =
  | ApprovalRecordArtifact
  | AuditLogArtifact
  | MergeDecisionArtifact
  | RebaseResultArtifact
  | ArtifactEnvelope;

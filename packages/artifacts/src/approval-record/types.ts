import type { ArtifactEnvelope } from '../artifact-envelope/types.js';

export type ApprovalSubjectType = 'spec' | 'slice' | 'pull-request' | 'merge';

export type ApprovalDecision = 'approved' | 'rejected' | 'needs-changes';

export interface ApprovalRecordPayload {
  approvalId: string;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  actorId: string;
  decision: ApprovalDecision;
  rationale: string;
}

export type ApprovalRecordArtifact = ArtifactEnvelope<
  ApprovalRecordPayload,
  'approval-record'
>;

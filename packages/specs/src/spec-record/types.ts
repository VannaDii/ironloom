export type SpecApprovalState = 'draft' | 'review' | 'approved';

export interface SpecRevision {
  version: number;
  summary: string;
  updatedAt: string;
  artifactId?: string;
}

export interface SpecRecord {
  specId: string;
  researchId: string;
  title: string;
  objective: string;
  acceptanceCriteria: string[];
  approvalState: SpecApprovalState;
  version: number;
  updatedAt: string;
  revisionHistory?: SpecRevision[];
  renderedPullRequestBody?: string;
  sourceArtifactIds?: string[];
}

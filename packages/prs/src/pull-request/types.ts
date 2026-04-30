export type PullRequestReviewState =
  | 'draft'
  | 'review'
  | 'approved'
  | 'changes-requested';

export interface PullRequestProjection {
  body: string;
  checklist: string[];
  riskSummary: string;
  validationSummary: string;
  artifactIds: string[];
}

export interface PullRequestRecord {
  prNumber: number;
  branchName: string;
  baseBranch: string;
  title: string;
  labels: string[];
  reviewState: PullRequestReviewState;
  mergeReady: boolean;
  updatedAt: string;
  projection?: PullRequestProjection;
  sourceArtifactIds?: string[];
}

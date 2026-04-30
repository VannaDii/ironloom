export type GitHubAction =
  | 'create-pr'
  | 'update-pr'
  | 'comment-pr'
  | 'merge-pr'
  | 'sync-branch';

export type GitHubHttpMethod = 'POST' | 'PATCH' | 'PUT';
export type GitHubSubmissionMode = 'live' | 'dry-run';

export interface GitHubActionRequest {
  repoFullName: string;
  action: GitHubAction;
  summary: string;
  privileged: boolean;
  targetNumber?: number;
  branchName?: string;
  baseBranch?: string;
  title?: string;
  body?: string;
  commentBody?: string;
  expectedHeadSha?: string;
  updatedAt: string;
}

export interface GitHubRestRequest {
  method: GitHubHttpMethod;
  endpoint: string;
  body: Record<string, unknown>;
}

export interface GitHubSubmissionReceipt {
  method: GitHubHttpMethod;
  endpoint: string;
  statusCode: number;
  responseBody: unknown;
}

export interface GitHubActionDecision {
  request: GitHubActionRequest;
  allowed: boolean;
  policyDecisionId: string;
  submitted: boolean;
  receipt?: GitHubSubmissionReceipt;
}

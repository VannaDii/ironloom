export interface RemediationResult {
  action: string;
  success: boolean;
  artifactId?: string;
  detail: string;
  completedAt: string;
}

export interface RemediationPlan {
  planId: string;
  findingIds: string[];
  actions: string[];
  autofix: boolean;
  approvalRequired: boolean;
  updatedAt: string;
  results?: RemediationResult[];
  unresolvedFindingIds?: string[];
  nextAction?: string;
}

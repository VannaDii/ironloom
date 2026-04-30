export type QualityGateStatus = 'passed' | 'failed';

export type NormalizedSonarIssueSeverity =
  | 'info'
  | 'minor'
  | 'major'
  | 'critical'
  | 'blocker';

export interface NormalizedSonarIssue {
  issueKey: string;
  severity: NormalizedSonarIssueSeverity;
  path: string;
  message: string;
  effortMinutes: number;
  blocking: boolean;
}

export interface SonarQualityGateResult {
  projectKey: string;
  status: QualityGateStatus;
  overallCoverage: number;
  newCodeCoverage: number;
  blockingIssues: number;
  evaluatedAt: string;
  issues?: NormalizedSonarIssue[];
  nextAction?: string;
}

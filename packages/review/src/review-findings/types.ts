export type ReviewSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ReviewFindingSource = 'automated' | 'sonar' | 'human';

export interface SpecConformanceSummary {
  specId: string;
  satisfiedCriteria: string[];
  missingCriteria: string[];
}

export interface ReviewFinding {
  findingId: string;
  severity: ReviewSeverity;
  path: string;
  message: string;
  rationale: string;
  fixRecommendation: string;
  blocking: boolean;
  updatedAt: string;
  source?: ReviewFindingSource;
  specConformance?: SpecConformanceSummary;
}

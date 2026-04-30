import type * as t from 'io-ts';

import type {
  NormalizedSonarIssueCodec,
  NormalizedSonarIssueSeverityCodec,
  QualityGateStatusCodec,
  SonarQualityGateResultCodec,
} from './codec.js';

export type QualityGateStatus = t.TypeOf<typeof QualityGateStatusCodec>;

export type NormalizedSonarIssueSeverity = t.TypeOf<
  typeof NormalizedSonarIssueSeverityCodec
>;

export type NormalizedSonarIssue = t.TypeOf<typeof NormalizedSonarIssueCodec>;

export type SonarQualityGateResult = t.TypeOf<
  typeof SonarQualityGateResultCodec
>;

import * as t from 'io-ts';

export const SonarApiQualityGateStatusCodec = t.union([
  t.literal('ERROR'),
  t.literal('NONE'),
  t.literal('OK'),
]);

export const SonarQualityGateConditionSnapshotCodec = t.type({
  metricKey: t.string,
  comparator: t.string,
  errorThreshold: t.string,
  actualValue: t.union([t.string, t.null]),
});

export const SonarBootstrapVerificationInputCodec = t.type({
  projectKey: t.string,
  qualityGateStatus: SonarApiQualityGateStatusCodec,
  conditions: t.array(SonarQualityGateConditionSnapshotCodec),
  evaluatedAt: t.string,
});

export const SonarBootstrapVerificationChecksCodec = t.type({
  qualityGateComputed: t.boolean,
  qualityGatePassing: t.boolean,
  overallCoverageCondition: t.boolean,
  newCodeCoverageCondition: t.boolean,
});

export const SonarBootstrapVerificationResultCodec = t.type({
  projectKey: t.string,
  status: t.union([t.literal('failed'), t.literal('passed')]),
  qualityGateStatus: SonarApiQualityGateStatusCodec,
  overallCoverageThreshold: t.number,
  newCodeCoverageThreshold: t.number,
  checks: SonarBootstrapVerificationChecksCodec,
  issues: t.array(t.string),
  evaluatedAt: t.string,
});

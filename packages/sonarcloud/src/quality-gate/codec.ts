import * as t from 'io-ts';

export const QualityGateStatusCodec = t.union([
  t.literal('passed'),
  t.literal('failed'),
]);

export const NormalizedSonarIssueSeverityCodec = t.union([
  t.literal('info'),
  t.literal('minor'),
  t.literal('major'),
  t.literal('critical'),
  t.literal('blocker'),
]);

export const NormalizedSonarIssueCodec = t.type({
  issueKey: t.string,
  severity: NormalizedSonarIssueSeverityCodec,
  path: t.string,
  message: t.string,
  effortMinutes: t.number,
  blocking: t.boolean,
});

export const SonarQualityGateResultCodec = t.intersection([
  t.type({
    projectKey: t.string,
    status: QualityGateStatusCodec,
    overallCoverage: t.number,
    newCodeCoverage: t.number,
    blockingIssues: t.number,
    evaluatedAt: t.string,
  }),
  t.partial({
    issues: t.array(NormalizedSonarIssueCodec),
    nextAction: t.string,
  }),
]);

/** Normalized Sonar quality gate status. */
export type QualityGateStatus = t.TypeOf<typeof QualityGateStatusCodec>;

/** Normalized Sonar issue severity. */
export type NormalizedSonarIssueSeverity = t.TypeOf<
  typeof NormalizedSonarIssueSeverityCodec
>;

/** Normalized Sonar issue used by review and gate summaries. */
export type NormalizedSonarIssue = t.TypeOf<typeof NormalizedSonarIssueCodec>;

/** Normalized Sonar quality gate result. */
export type SonarQualityGateResult = t.TypeOf<
  typeof SonarQualityGateResultCodec
>;

import * as t from 'io-ts';

import type { SonarQualityGateResult } from './types.js';

export const NormalizedSonarIssueCodec = t.type({
  issueKey: t.string,
  severity: t.union([
    t.literal('info'),
    t.literal('minor'),
    t.literal('major'),
    t.literal('critical'),
    t.literal('blocker'),
  ]),
  path: t.string,
  message: t.string,
  effortMinutes: t.number,
  blocking: t.boolean,
});

export const SonarQualityGateResultCodec = t.intersection([
  t.type({
    projectKey: t.string,
    status: t.union([t.literal('passed'), t.literal('failed')]),
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

export type _SonarQualityGateResultExact =
  t.TypeOf<typeof SonarQualityGateResultCodec> extends SonarQualityGateResult
    ? SonarQualityGateResult extends t.TypeOf<
        typeof SonarQualityGateResultCodec
      >
      ? true
      : never
    : never;

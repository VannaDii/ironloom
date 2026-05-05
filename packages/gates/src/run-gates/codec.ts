import * as t from 'io-ts';

import {
  IsoTimestampCodec,
  LifecycleStatusCodec,
} from '@vannadii/devplat-core';

export const GateFailureKindCodec = t.union([
  t.literal('command-failed'),
  t.literal('timeout'),
  t.literal('passed'),
]);

export const GateCheckResultCodec = t.intersection([
  t.type({
    name: t.string,
    success: t.boolean,
    detail: t.string,
  }),
  t.partial({
    failureKind: GateFailureKindCodec,
    nextAction: t.string,
  }),
]);

export const GateFailureClassificationCodec = t.type({
  kind: t.union([
    t.literal('passed'),
    t.literal('retryable'),
    t.literal('requires-remediation'),
  ]),
  failedGateNames: t.array(t.string),
  nextAction: t.string,
});

export const GateRemediationHookCodec = t.type({
  hookId: t.string,
  gateRunReportId: t.string,
  failedGateNames: t.array(t.string),
  retryableGateNames: t.array(t.string),
  remediationFindingIds: t.array(t.string),
  actions: t.array(t.string),
  autofixEligible: t.boolean,
  approvalRequired: t.boolean,
  nextAction: t.string,
  createdAt: IsoTimestampCodec,
});

export const GateRunReportCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: IsoTimestampCodec,
    passed: t.boolean,
    results: t.array(GateCheckResultCodec),
  }),
  t.partial({
    classification: GateFailureClassificationCodec,
    remediationHook: GateRemediationHookCodec,
    nextAction: t.string,
  }),
]);

/** Gate failure class used for retry and remediation routing. */
export type GateFailureKind = t.TypeOf<typeof GateFailureKindCodec>;

/** Result for one quality gate command. */
export type GateCheckResult = t.TypeOf<typeof GateCheckResultCodec>;

/** Aggregate gate failure classification and next action hint. */
export type GateFailureClassification = t.TypeOf<
  typeof GateFailureClassificationCodec
>;

/** Remediation hook generated from a failed gate run. */
export type GateRemediationHook = t.TypeOf<typeof GateRemediationHookCodec>;

/** Persisted report for a quality gate run. */
export type GateRunReport = t.TypeOf<typeof GateRunReportCodec>;

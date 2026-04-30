import * as t from 'io-ts';

import { LifecycleStatusCodec, type Exact } from '@vannadii/devplat-core';

import type { GateRunReport } from './types.js';

export const GateCheckResultCodec = t.intersection([
  t.type({
    name: t.string,
    success: t.boolean,
    detail: t.string,
  }),
  t.partial({
    failureKind: t.union([
      t.literal('command-failed'),
      t.literal('timeout'),
      t.literal('passed'),
    ]),
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

export const GateRunReportCodec = t.intersection([
  t.type({
    id: t.string,
    summary: t.string,
    status: LifecycleStatusCodec,
    trace: t.array(t.string),
    updatedAt: t.string,
    passed: t.boolean,
    results: t.array(GateCheckResultCodec),
  }),
  t.partial({
    classification: GateFailureClassificationCodec,
    nextAction: t.string,
  }),
]);

export type _GateRunReportExact = Exact<
  GateRunReport,
  t.TypeOf<typeof GateRunReportCodec>
>;

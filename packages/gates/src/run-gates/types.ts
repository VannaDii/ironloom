import type * as t from 'io-ts';

import type {
  GateCheckResultCodec,
  GateFailureClassificationCodec,
  GateFailureKindCodec,
  GateRunReportCodec,
} from './codec.js';

export type GateFailureKind = t.TypeOf<typeof GateFailureKindCodec>;

export type GateCheckResult = t.TypeOf<typeof GateCheckResultCodec>;

export type GateFailureClassification = t.TypeOf<
  typeof GateFailureClassificationCodec
>;

export type GateRunReport = t.TypeOf<typeof GateRunReportCodec>;

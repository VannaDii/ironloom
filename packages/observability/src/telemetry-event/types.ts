import type * as t from 'io-ts';

import type { TelemetryEventCodec, TelemetryRunSummaryCodec } from './codec.js';

export type TelemetryEvent = t.TypeOf<typeof TelemetryEventCodec>;

export type TelemetryRunSummary = t.TypeOf<typeof TelemetryRunSummaryCodec>;

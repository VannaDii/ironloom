import * as t from 'io-ts';

import { LifecycleStatusCodec } from '@vannadii/devplat-core';

export const TelemetryEventCodec = t.type({
  id: t.string,
  summary: t.string,
  status: LifecycleStatusCodec,
  trace: t.array(t.string),
  updatedAt: t.string,
  actorId: t.string,
  action: t.string,
  scope: t.union([
    t.literal('discord'),
    t.literal('github'),
    t.literal('supervisor'),
    t.literal('storage'),
  ]),
  details: t.UnknownRecord,
});

export const TelemetryRunSummaryCodec = t.type({
  runId: t.string,
  eventIds: t.array(t.string),
  scopes: t.array(
    t.union([
      t.literal('discord'),
      t.literal('github'),
      t.literal('supervisor'),
      t.literal('storage'),
    ]),
  ),
  actionCount: t.number,
  failedCount: t.number,
  startedAt: t.string,
  completedAt: t.string,
});

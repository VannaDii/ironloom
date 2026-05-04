import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  TelemetryAuditRecordCodec,
  TelemetryEventCodec,
  TelemetryRunSummaryCodec,
} from './codec.js';

describe('telemetry event codecs', () => {
  const cases = [
    {
      name: 'decode valid telemetry payloads',
      inputs: {
        decoders: [
          {
            codec: TelemetryEventCodec,
            value: {
              id: 'telemetry:run-1',
              summary: 'Recorded run telemetry.',
              status: 'complete',
              trace: [],
              updatedAt: '2026-04-04T00:00:00.000Z',
              actorId: 'operator-1',
              action: 'run-gates',
              scope: 'github',
              details: {},
            },
          },
          {
            codec: TelemetryAuditRecordCodec,
            value: {
              auditId: 'audit-1',
              runId: 'run-1',
              eventId: 'telemetry:run-1',
              actorId: 'operator-1',
              action: 'run-gates',
              scope: 'github',
              outcome: 'completed',
              reason: 'Gates passed.',
              artifactIds: [],
              recordedAt: '2026-04-04T00:00:00.000Z',
              details: {},
            },
          },
          {
            codec: TelemetryRunSummaryCodec,
            value: {
              runId: 'run-1',
              eventIds: ['telemetry:run-1'],
              scopes: ['github'],
              actionCount: 1,
              failedCount: 0,
              auditRecordIds: ['audit-1'],
              artifactIds: [],
              runMetrics: {
                runId: 'run-1',
                durationMs: 1,
                scopeCounts: [{ scope: 'github', count: 1 }],
                statusCounts: [{ status: 'complete', count: 1 }],
                privilegedActionCount: 0,
                blockedCount: 0,
                failedCount: 0,
                auditRecordIds: ['audit-1'],
                artifactIds: [],
              },
              startedAt: '2026-04-04T00:00:00.000Z',
              completedAt: '2026-04-04T00:00:01.000Z',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid telemetry timestamps',
      inputs: {
        decoders: [
          {
            codec: TelemetryEventCodec,
            value: {
              id: 'telemetry:run-1',
              summary: 'Recorded run telemetry.',
              status: 'complete',
              trace: [],
              updatedAt: '2026-04-04',
              actorId: 'operator-1',
              action: 'run-gates',
              scope: 'github',
              details: {},
            },
          },
          {
            codec: TelemetryAuditRecordCodec,
            value: {
              auditId: 'audit-1',
              runId: 'run-1',
              eventId: 'telemetry:run-1',
              actorId: 'operator-1',
              action: 'run-gates',
              scope: 'github',
              outcome: 'completed',
              reason: 'Gates passed.',
              artifactIds: [],
              recordedAt: 'April 4, 2026',
              details: {},
            },
          },
          {
            codec: TelemetryRunSummaryCodec,
            value: {
              runId: 'run-1',
              eventIds: ['telemetry:run-1'],
              scopes: ['github'],
              actionCount: 1,
              failedCount: 0,
              auditRecordIds: ['audit-1'],
              artifactIds: [],
              runMetrics: {
                runId: 'run-1',
                durationMs: 1,
                scopeCounts: [{ scope: 'github', count: 1 }],
                statusCounts: [{ status: 'complete', count: 1 }],
                privilegedActionCount: 0,
                blockedCount: 0,
                failedCount: 0,
                auditRecordIds: ['audit-1'],
                artifactIds: [],
              },
              startedAt: '2026-04-04T00:00:00.000Z',
              completedAt: '2026-04-04 00:00:01',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});

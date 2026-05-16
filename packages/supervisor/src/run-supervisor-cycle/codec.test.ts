import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  SupervisorContinuationDecisionCodec,
  SupervisorContinuationRequestCodec,
  SupervisorDecisionCodec,
} from './codec.js';

describe('run supervisor cycle codecs', () => {
  const cases = [
    {
      name: 'decode valid supervisor lifecycle timestamps',
      inputs: {
        decision: {
          id: 'supervisor-1',
          summary: 'Route to gates.',
          status: 'running',
          trace: ['implementation complete'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'route',
          nextState: 'review',
          approved: true,
          notes: ['Gates passed.'],
        },
      },
      mock: ({ decision }) =>
        decodeWithCodec(SupervisorDecisionCodec, decision),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(true);
      },
    },
    {
      name: 'reject invalid supervisor lifecycle timestamps',
      inputs: {
        decision: {
          id: 'supervisor-1',
          summary: 'Route to gates.',
          status: 'running',
          trace: ['implementation complete'],
          updatedAt: 'April 4, 2026',
          action: 'route',
          nextState: 'review',
          approved: true,
          notes: ['Gates passed.'],
        },
      },
      mock: ({ decision }) =>
        decodeWithCodec(SupervisorDecisionCodec, decision),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(false);
      },
    },
    {
      name: 'decode valid headless continuation requests and decisions',
      inputs: {
        decision: {
          request: {
            requestId: 'continue-1',
            repositoryKey: 'VannaDii/devplat',
            objective: 'Add a small lifecycle feature.',
            actorId: 'agent-1',
            updatedAt: '2026-05-15T00:00:00.000Z',
            artifacts: [
              {
                artifactId: 'spec-artifact-1',
                artifactType: 'spec-record',
                status: 'approved',
                updatedAt: '2026-05-15T00:00:00.000Z',
              },
            ],
          },
          continuation: {
            id: 'continuation-continue-1',
            summary: 'Continue VannaDii/devplat.',
            status: 'running',
            trace: ['supervisor:continuation:create_slice_plan'],
            updatedAt: '2026-05-15T00:00:00.000Z',
            requestId: 'continue-1',
            repositoryKey: 'VannaDii/devplat',
            objective: 'Add a small lifecycle feature.',
            actorId: 'agent-1',
            nextAction: {
              kind: 'create-slice-plan',
              phase: 'slicing',
              routedTo: 'slice-plan-service',
              toolName: 'create_slice_plan',
              summary: 'Create an implementation slice plan.',
              reason: 'Approved spec exists without a slice plan.',
              requiresHumanApproval: false,
              artifactIds: ['spec-artifact-1'],
              missingArtifactTypes: ['slice-plan'],
              inputRequirements: [
                'Approved spec record',
                'PR-sized implementation boundary',
              ],
            },
            artifactIds: ['spec-artifact-1'],
            blockers: [],
          },
        },
      },
      mock: ({ decision }) => ({
        request: decodeWithCodec(
          SupervisorContinuationRequestCodec,
          decision.request,
        ),
        continuation: decodeWithCodec(
          SupervisorContinuationDecisionCodec,
          decision.continuation,
        ),
      }),
      assert: (decoded: {
        request: ReturnType<typeof decodeWithCodec>;
        continuation: ReturnType<typeof decodeWithCodec>;
      }) => {
        expect(decoded.request.ok).toBe(true);
        expect(decoded.continuation.ok).toBe(true);
      },
    },
    {
      name: 'reject headless continuation requests with loose repository keys',
      inputs: {
        decision: {
          requestId: 'continue-1',
          repositoryKey: 'devplat',
          objective: 'Add a small lifecycle feature.',
          actorId: 'agent-1',
          updatedAt: '2026-05-15T00:00:00.000Z',
          artifacts: [],
        },
      },
      mock: ({ decision }) =>
        decodeWithCodec(SupervisorContinuationRequestCodec, decision),
      assert: (decoded: ReturnType<typeof decodeWithCodec>) => {
        expect(decoded.ok).toBe(false);
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    const outcome = testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});

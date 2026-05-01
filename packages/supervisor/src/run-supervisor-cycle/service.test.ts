import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';
import { FileStoreService } from '@vannadii/devplat-storage';

import { SupervisorCycleService } from './service.js';
import type { SupervisorDecision } from './types.js';

type SupervisorRunStepInput = {
  action: string;
  actorId: string;
  privileged: boolean;
  lifecycleSignals?: SupervisorDecision['lifecycleSignals'];
};

type SupervisorCycleServiceInputs =
  | {
      mode: 'run';
      runStep: SupervisorRunStepInput;
    }
  | {
      mode: 'execute-and-run';
      decision: SupervisorDecision;
      runStep: SupervisorRunStepInput;
    };

type SupervisorCycleServiceCase = {
  name: string;
  inputs: SupervisorCycleServiceInputs;
  mock: () => Promise<{
    service: SupervisorCycleService;
  }>;
  assert: (
    context: { service: SupervisorCycleService },
    inputs: SupervisorCycleServiceInputs,
  ) => Promise<void>;
};

async function createService(): Promise<SupervisorCycleService> {
  const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-supervisor-'));

  return new SupervisorCycleService(
    new DecisionPolicyService(),
    new TelemetryEventService(new FileStoreService(rootDirectory)),
  );
}

describe('SupervisorCycleService', () => {
  const cases = [
    {
      name: 'records supervisor decisions through observability',
      inputs: {
        mode: 'run',
        runStep: {
          action: 'retry-gates',
          actorId: 'operator-1',
          privileged: false,
          lifecycleSignals: [
            {
              phase: 'gates',
              ready: true,
              artifactIds: ['gate-run-1'],
              blockers: [],
              nextAction: 'review-findings',
            },
          ],
        },
      },
      mock: async () => ({
        service: await createService(),
      }),
      assert: async (context, inputs) => {
        if (inputs.mode !== 'run') {
          throw new Error('expected run inputs');
        }

        const decision = await context.service.runStep(inputs.runStep);

        expect(decision.approved).toBe(true);
        expect(decision.routePlan?.nextPhase).toBe('review');
      },
    },
    {
      name: 'covers execute, explain, and blocked run steps',
      inputs: {
        mode: 'execute-and-run',
        decision: {
          id: 'supervisor-merge-now',
          summary: '  Supervisor handled merge-now  ',
          status: 'review',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          action: 'merge-now',
          nextState: 'review',
          approved: false,
          notes: ['requires approval'],
        },
        runStep: {
          action: 'merge-now',
          actorId: 'operator-2',
          privileged: true,
        },
      },
      mock: async () => ({
        service: await createService(),
      }),
      assert: async (context, inputs) => {
        if (inputs.mode !== 'execute-and-run') {
          throw new Error('expected execute-and-run inputs');
        }

        const executed = context.service.execute(inputs.decision);
        const decision = await context.service.runStep(inputs.runStep);

        expect(context.service.explain(executed)).toContain(
          'merge-now -> review',
        );
        expect(decision.approved).toBe(false);
      },
    },
  ] satisfies SupervisorCycleServiceCase[];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});

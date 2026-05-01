import { describe, expect, it } from 'vitest';
import type { CommandResult } from '@vannadii/devplat-execution';

import {
  classifyGateRun,
  createGateCheckResult,
  createGateRemediationHook,
  createGateRunReport,
  describeGateRunReport,
  getNpmCommand,
  resolveGateCommand,
  runGates,
} from './logic.js';
import type { GateRunReport } from './types.js';

type GateLogicInputs =
  | {
      mode: 'npm-binary';
    }
  | {
      mode: 'resolve-command';
      gateName: string;
    }
  | {
      mode: 'run-success';
      gateNames: string[];
      summary: string;
    }
  | {
      mode: 'run-timeout';
      gateNames: string[];
      summary: string;
    }
  | {
      mode: 'failed-report';
      report: GateRunReport;
    }
  | {
      mode: 'classification';
      commandResult: CommandResult;
    }
  | {
      mode: 'remediation-hook';
      report: GateRunReport;
    };

type GateLogicContext = {
  executeGate?: (
    command: string,
    args: readonly string[],
  ) => Promise<CommandResult>;
};

type GateLogicCase = {
  name: string;
  inputs: GateLogicInputs;
  mock: (inputs: GateLogicInputs) => GateLogicContext;
  assert: (
    context: GateLogicContext,
    inputs: GateLogicInputs,
  ) => Promise<void> | void;
};

describe('GateRunReport logic', () => {
  const cases = [
    {
      name: 'selects the correct npm binary for supported platforms',
      inputs: {
        mode: 'npm-binary',
      },
      mock: () => ({}),
      assert: () => {
        expect(getNpmCommand('darwin')).toBe('npm');
        expect(getNpmCommand('win32')).toBe('npm.cmd');
      },
    },
    {
      name: 'resolves gate names to npm run invocations',
      inputs: {
        mode: 'resolve-command',
        gateName: ' lint ',
      },
      mock: () => ({}),
      assert: (_context, inputs) => {
        if (inputs.mode !== 'resolve-command') {
          throw new Error('expected resolve-command inputs');
        }

        expect(resolveGateCommand(inputs.gateName)).toEqual({
          command: getNpmCommand(),
          args: ['run', 'lint'],
        });
      },
    },
    {
      name: 'creates a passed gate report for successful commands',
      inputs: {
        mode: 'run-success',
        gateNames: ['lint', 'typecheck', 'test'],
        summary: 'Run default gates',
      },
      mock: () => ({
        executeGate: async (
          command: string,
          args: readonly string[],
        ): Promise<CommandResult> => ({
          command,
          args: [...args],
          exitCode: 0,
          timedOut: false,
          stdout: '',
          stderr: '',
          durationMs: 10,
        }),
      }),
      assert: async (context, inputs) => {
        if (
          inputs.mode !== 'run-success' ||
          context.executeGate === undefined
        ) {
          throw new Error('expected run-success inputs');
        }

        const report = await runGates(
          inputs.gateNames,
          inputs.summary,
          context.executeGate,
        );

        expect(report.passed).toBe(true);
        expect(report.results).toHaveLength(3);
        expect(report.remediationHook).toBeUndefined();
        expect(describeGateRunReport(report)).toContain('passed');
      },
    },
    {
      name: 'marks timed out commands as failed gate checks',
      inputs: {
        mode: 'run-timeout',
        gateNames: ['test'],
        summary: 'Timeout gate',
      },
      mock: () => ({
        executeGate: async (): Promise<CommandResult> => ({
          command: getNpmCommand(),
          args: ['run', 'test'],
          exitCode: 124,
          timedOut: true,
          stdout: '',
          stderr: 'timed out',
          durationMs: 25,
        }),
      }),
      assert: async (context, inputs) => {
        if (
          inputs.mode !== 'run-timeout' ||
          context.executeGate === undefined
        ) {
          throw new Error('expected run-timeout inputs');
        }

        const report = await runGates(
          inputs.gateNames,
          inputs.summary,
          context.executeGate,
        );

        expect(report.passed).toBe(false);
        expect(report.nextAction).toBe('retry-gates');
        expect(report.classification?.kind).toBe('retryable');
        expect(report.remediationHook).toBeUndefined();
        expect(report.results[0]).toMatchObject({
          name: 'test',
          success: false,
          detail: expect.stringContaining('(timed out)'),
          failureKind: 'timeout',
        });
      },
    },
    {
      name: 'describes failed gate reports',
      inputs: {
        mode: 'failed-report',
        report: {
          id: 'gate-run-report',
          summary: '  failed gates  ',
          status: 'failed',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          passed: false,
          results: [{ name: 'lint', success: false, detail: 'lint failed' }],
        },
      },
      mock: () => ({}),
      assert: (_context, inputs) => {
        if (inputs.mode !== 'failed-report') {
          throw new Error('expected failed-report inputs');
        }

        const report = createGateRunReport(inputs.report);

        expect(report.trace).toContain('gates:failed');
        expect(report.nextAction).toBe('create-remediation-plan');
        expect(report.remediationHook?.failedGateNames).toEqual(['lint']);
        expect(describeGateRunReport(report)).toContain('failed');
      },
    },
    {
      name: 'classifies gate failures with next-action hints',
      inputs: {
        mode: 'classification',
        commandResult: {
          command: 'npm',
          args: ['run', 'lint'],
          exitCode: 1,
          timedOut: false,
          stdout: '',
          stderr: 'lint failed',
          durationMs: 10,
        },
      },
      mock: () => ({}),
      assert: (_context, inputs) => {
        if (inputs.mode !== 'classification') {
          throw new Error('expected classification inputs');
        }

        const result = createGateCheckResult('lint', inputs.commandResult);

        expect(classifyGateRun([result])).toEqual({
          kind: 'requires-remediation',
          failedGateNames: ['lint'],
          nextAction: 'create-remediation-plan',
        });
      },
    },
    {
      name: 'creates remediation hooks for non-timeout gate failures',
      inputs: {
        mode: 'remediation-hook',
        report: {
          id: 'gate-run-1',
          summary: 'Failed gates',
          status: 'failed',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          passed: false,
          results: [
            {
              name: ' lint ',
              success: false,
              detail: ' lint failed ',
              failureKind: 'command-failed',
              nextAction: 'remediate-failure',
            },
            {
              name: 'test',
              success: false,
              detail: 'timed out',
              failureKind: 'timeout',
              nextAction: 'retry-gates',
            },
          ],
        },
      },
      mock: () => ({}),
      assert: (_context, inputs) => {
        if (inputs.mode !== 'remediation-hook') {
          throw new Error('expected remediation-hook inputs');
        }

        const hook = createGateRemediationHook(inputs.report);
        const report = createGateRunReport(inputs.report);

        expect(hook).toMatchObject({
          hookId: 'gate-run-1:remediation-hook',
          gateRunReportId: 'gate-run-1',
          failedGateNames: ['lint', 'test'],
          retryableGateNames: ['test'],
          remediationFindingIds: ['gate:lint'],
          autofixEligible: true,
          approvalRequired: true,
          nextAction: 'create-remediation-plan',
        });
        expect(hook.actions).toEqual(['Fix lint gate failure: lint failed']);
        expect(report.remediationHook).toEqual(hook);
      },
    },
    {
      name: 'falls back to failed result names when classification lacks names',
      inputs: {
        mode: 'remediation-hook',
        report: {
          id: 'gate-run-2',
          summary: 'Failed gates',
          status: 'failed',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          passed: false,
          classification: {
            kind: 'requires-remediation',
            failedGateNames: [],
            nextAction: 'create-remediation-plan',
          },
          results: [
            {
              name: 'typecheck',
              success: false,
              detail: 'typecheck failed',
              failureKind: 'command-failed',
              nextAction: 'remediate-failure',
            },
          ],
        },
      },
      mock: () => ({}),
      assert: (_context, inputs) => {
        if (inputs.mode !== 'remediation-hook') {
          throw new Error('expected remediation-hook inputs');
        }

        const hook = createGateRemediationHook(inputs.report);

        expect(hook.failedGateNames).toEqual(['typecheck']);
        expect(hook.remediationFindingIds).toEqual(['gate:typecheck']);
      },
    },
  ] satisfies GateLogicCase[];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      expect.hasAssertions();
      const context = testCase.mock(testCase.inputs);

      await testCase.assert(context, testCase.inputs);
    });
  }
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CommandExecutionService,
  type CommandResult,
} from '@vannadii/devplat-execution';

import { getNpmCommand } from './logic.js';
import { RunGatesService } from './service.js';
import type { GateRunReport } from './codec.js';

type RunGatesServiceInputs =
  | {
      mode: 'custom-executor';
      gateNames: string[];
      summary: string;
    }
  | {
      mode: 'default-executor';
      gateNames: string[];
      summary: string;
    }
  | {
      mode: 'execute';
      report: GateRunReport;
    };

type RunGatesServiceCase = {
  name: string;
  inputs: RunGatesServiceInputs;
  mock: () => {
    service: RunGatesService;
  };
  assert: (
    context: { service: RunGatesService },
    inputs: RunGatesServiceInputs,
  ) => Promise<void> | void;
};

describe('RunGatesService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const cases = [
    {
      name: 'runs gates through the service shell',
      inputs: {
        mode: 'custom-executor',
        gateNames: ['lint'],
        summary: 'Lint only',
      },
      mock: () => ({
        service: new RunGatesService(
          async (
            command: string,
            args: readonly string[],
          ): Promise<CommandResult> => ({
            command,
            args: [...args],
            exitCode: 0,
            timedOut: false,
            stdout: '',
            stderr: '',
            durationMs: 5,
          }),
        ),
      }),
      assert: async (context, inputs) => {
        if (inputs.mode !== 'custom-executor') {
          throw new Error('expected custom-executor inputs');
        }

        const report = await context.service.run(
          inputs.gateNames,
          inputs.summary,
        );

        expect(context.service.explain(report)).toContain('1 gates');
      },
    },
    {
      name: 'uses the default command execution service when no executor is supplied',
      inputs: {
        mode: 'default-executor',
        gateNames: ['lint'],
        summary: 'Lint only',
      },
      mock: () => {
        vi.spyOn(
          CommandExecutionService.prototype,
          'execute',
        ).mockResolvedValue({
          command: getNpmCommand(),
          args: ['run', 'lint'],
          exitCode: 0,
          timedOut: false,
          stdout: '',
          stderr: '',
          durationMs: 5,
        });

        return {
          service: new RunGatesService(),
        };
      },
      assert: async (context, inputs) => {
        if (inputs.mode !== 'default-executor') {
          throw new Error('expected default-executor inputs');
        }

        const report = await context.service.run(
          inputs.gateNames,
          inputs.summary,
        );

        expect(CommandExecutionService.prototype.execute).toHaveBeenCalledWith(
          getNpmCommand(),
          ['run', 'lint'],
        );
        expect(report.passed).toBe(true);
      },
    },
    {
      name: 'covers execute with an explicit failed report',
      inputs: {
        mode: 'execute',
        report: {
          id: 'gate-run-report',
          summary: '  failed run  ',
          status: 'failed',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          passed: false,
          results: [],
        },
      },
      mock: () => ({
        service: new RunGatesService(),
      }),
      assert: (context, inputs) => {
        if (inputs.mode !== 'execute') {
          throw new Error('expected execute inputs');
        }

        const report = context.service.execute(inputs.report);

        expect(report.summary).toBe('failed run');
        expect(report.trace).toContain('gates:failed');
      },
    },
  ] satisfies RunGatesServiceCase[];

  for (const testCase of cases) {
    it(testCase.name, async () => {
      expect.hasAssertions();
      const context = testCase.mock();

      await testCase.assert(context, testCase.inputs);
    });
  }
});

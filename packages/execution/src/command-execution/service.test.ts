import { describe, expect, it } from 'vitest';

import { CommandExecutionService } from './service.js';

describe('CommandExecutionService', () => {
  it('executes subprocesses and captures structured output', async () => {
    const service = new CommandExecutionService();
    const snapshot = await service.execute(
      process.execPath,
      ['-e', 'process.stdout.write(process.env.DEVPLAT_TEST_VALUE ?? "")'],
      {
        env: {
          DEVPLAT_TEST_VALUE: 'ok',
        },
      },
    );

    expect(snapshot.exitCode).toBe(0);
    expect(snapshot.stdout).toBe('ok');
    expect(service.explain(snapshot)).toContain('exit 0');
  });

  it('returns structured failures when spawning fails', async () => {
    const service = new CommandExecutionService();
    const snapshot = await service.execute(
      'definitely-not-a-real-command-devplat',
    );

    expect(snapshot.exitCode).toBe(1);
    expect(snapshot.stderr.length).toBeGreaterThan(0);
  });

  it('captures stderr output from failing subprocesses', async () => {
    const service = new CommandExecutionService();
    const snapshot = await service.execute(process.execPath, [
      '-e',
      'process.stderr.write("bad"); process.exit(2)',
    ]);

    expect(snapshot.exitCode).toBe(2);
    expect(snapshot.stderr).toBe('bad');
  });

  it('terminates subprocesses when timeouts are exceeded', async () => {
    const service = new CommandExecutionService();
    const snapshot = await service.execute(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 1_000)'],
      { timeoutMs: 25 },
    );

    expect(snapshot.timedOut).toBe(true);
    expect(snapshot.exitCode).toBe(124);
  });

  it('normalizes signal-only subprocess exits without timeout state', async () => {
    const cases = [
      {
        inputs: {
          args: ['-e', 'process.kill(process.pid, "SIGTERM")'],
        },
        mock: () => new CommandExecutionService(),
        assert: async (service: CommandExecutionService) => {
          const snapshot = await service.execute(
            process.execPath,
            cases[0].inputs.args,
          );

          expect(snapshot.timedOut).toBe(false);
          expect(snapshot.exitCode).toBe(1);
        },
      },
    ];

    for (const testCase of cases) {
      await testCase.assert(testCase.mock());
    }
  });

  it('retries failed subprocesses and truncates captured output', async () => {
    const service = new CommandExecutionService();
    const snapshot = await service.execute(
      process.execPath,
      [
        '-e',
        'process.stdout.write("abcdef"); process.stderr.write("ghijkl"); process.exit(2)',
      ],
      { maxOutputBytes: 3, retry: { attempts: 2 } },
    );

    expect(snapshot.attempts).toBe(2);
    expect(snapshot.stdout).toBe('abc');
    expect(snapshot.stderr).toBe('ghi');
    expect(snapshot.truncated).toBe(true);
  });
});

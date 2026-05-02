import { describe, expect, it } from 'vitest';

import {
  collectChangedFiles,
  createSonarCliInstallCommand,
  createSonarChangedFileCommands,
  classifySonarAnalysisFailure,
  formatSonarChangedFileReport,
  installSonarCli,
  parseSonarCliHelperArgs,
  parseSonarChangedFileArgs,
  resolveCurrentBranch,
  resolveBaseRef,
  resolveSqaaEnabled,
  runSonarChangedFileAnalysis,
} from './sonarqube-cli-analyze-changed.mjs';

describe('sonarqube-cli-analyze-changed', () => {
  const cases = [
    {
      name: 'creates installers for macOS Linux and Windows',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        expect(createSonarCliInstallCommand('darwin')).toEqual({
          args: [
            '-c',
            'curl -fsSL https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh | bash',
          ],
          command: 'bash',
          label: 'SonarQube CLI installer',
        });
        expect(createSonarCliInstallCommand('linux')).toEqual({
          args: [
            '-c',
            'curl -fsSL https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh | bash',
          ],
          command: 'bash',
          label: 'SonarQube CLI installer',
        });
        expect(createSonarCliInstallCommand('win32')).toEqual({
          args: [
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'irm https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.ps1 | iex',
          ],
          command: 'powershell',
          label: 'SonarQube CLI installer',
        });
      },
    },
    {
      name: 'runs the platform installer through the helper',
      inputs: {
        platform: 'linux',
      },
      mock: async () => {
        const runs = [];

        return {
          runs,
          runCommand: async (command, args, options) => {
            runs.push({ args, command, options });
          },
        };
      },
      assert: async (context, inputs) => {
        const command = await installSonarCli({
          platform: inputs.platform,
          rootDirectory: '/repo',
          runCommand: context.runCommand,
        });

        expect(command.command).toBe('bash');
        expect(context.runs).toEqual([
          {
            args: [
              '-c',
              'curl -fsSL https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh | bash',
            ],
            command: 'bash',
            options: {
              inputCommand: undefined,
              rootDirectory: '/repo',
            },
          },
        ]);
      },
    },
    {
      name: 'creates secrets verification and gated SQAA scans for changed files',
      inputs: {
        branch: 'feature/runtime',
        changedFiles: [
          './packages/openclaw/src/index.ts',
          'scripts/openclaw-live-lab.mjs',
        ],
        project: 'vannadii_devplat',
        sonarCommand: 'sonar',
        sqaaEnabled: true,
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const commands = createSonarChangedFileCommands(inputs);

        expect(commands).toEqual([
          {
            args: ['analyze', 'secrets', 'packages/openclaw/src/index.ts'],
            command: 'sonar',
            label: 'sonar analyze secrets packages/openclaw/src/index.ts',
          },
          {
            args: ['analyze', 'secrets', 'scripts/openclaw-live-lab.mjs'],
            command: 'sonar',
            label: 'sonar analyze secrets scripts/openclaw-live-lab.mjs',
          },
          {
            args: [
              'verify',
              '--file',
              'packages/openclaw/src/index.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar verify packages/openclaw/src/index.ts',
          },
          {
            args: [
              'verify',
              '--file',
              'scripts/openclaw-live-lab.mjs',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar verify scripts/openclaw-live-lab.mjs',
          },
          {
            args: [
              'analyze',
              'sqaa',
              '--file',
              'packages/openclaw/src/index.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar analyze sqaa packages/openclaw/src/index.ts',
          },
          {
            args: [
              'analyze',
              'sqaa',
              '--file',
              'scripts/openclaw-live-lab.mjs',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar analyze sqaa scripts/openclaw-live-lab.mjs',
          },
        ]);
      },
    },
    {
      name: 'collects changed files from git merge-base and diff',
      inputs: {
        baseRef: 'origin/main',
        headRef: 'HEAD',
      },
      mock: async () => {
        const calls = [];
        const execFileImpl = async (command, args, options) => {
          calls.push({ args, command, options });

          if (args[0] === 'merge-base') {
            return { stdout: 'merge-base-sha\n', stderr: '' };
          }

          if (args[0] === 'diff') {
            return {
              stdout:
                'packages/openclaw/src/index.ts\r\nscripts/openclaw-live-lab.mjs\n',
              stderr: '',
            };
          }

          throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
        };

        return { calls, execFileImpl };
      },
      assert: async (context, inputs) => {
        const files = await collectChangedFiles({
          baseRef: inputs.baseRef,
          execFileImpl: context.execFileImpl,
          headRef: inputs.headRef,
          rootDirectory: '/repo',
        });

        expect(files).toEqual([
          'packages/openclaw/src/index.ts',
          'scripts/openclaw-live-lab.mjs',
        ]);
        expect(context.calls).toEqual([
          {
            args: ['merge-base', 'HEAD', 'origin/main'],
            command: 'git',
            options: { cwd: '/repo' },
          },
          {
            args: [
              'diff',
              '--name-only',
              '--diff-filter=ACMRT',
              'merge-base-sha',
              'HEAD',
            ],
            command: 'git',
            options: { cwd: '/repo' },
          },
        ]);
      },
    },
    {
      name: 'resolves branch and project defaults internally',
      inputs: {
        changedFiles: ['packages/core/src/domain/logic.ts'],
      },
      mock: async () => {
        const calls = [];
        const execFileImpl = async (command, args, options) => {
          calls.push({ args, command, options });

          return { stdout: 'feature/runtime\n', stderr: '' };
        };

        return { calls, execFileImpl };
      },
      assert: async (context, inputs) => {
        const report = await runSonarChangedFileAnalysis({
          changedFiles: inputs.changedFiles,
          env: {},
          execFileImpl: context.execFileImpl,
          rootDirectory: '/repo',
          runCommand: async () => undefined,
        });

        expect(report.branch).toBe('feature/runtime');
        expect(report.project).toBe('vannadii_devplat');
        expect(report.commands).toEqual([
          {
            args: ['analyze', 'secrets', 'packages/core/src/domain/logic.ts'],
            command: 'sonar',
            label: 'sonar analyze secrets packages/core/src/domain/logic.ts',
          },
          {
            args: [
              'verify',
              '--file',
              'packages/core/src/domain/logic.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar verify packages/core/src/domain/logic.ts',
          },
        ]);
        expect(report.results).toEqual([
          {
            args: ['analyze', 'secrets', 'packages/core/src/domain/logic.ts'],
            command: 'sonar',
            label: 'sonar analyze secrets packages/core/src/domain/logic.ts',
            status: 'passed',
            stderr: '',
            stdout: '',
          },
          {
            args: [
              'verify',
              '--file',
              'packages/core/src/domain/logic.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar verify packages/core/src/domain/logic.ts',
            status: 'passed',
            stderr: '',
            stdout: '',
          },
          {
            args: ['analyze', 'sqaa'],
            command: 'sonar',
            label: 'sonar analyze sqaa',
            reason:
              'SQAA/A3S analysis is not enabled for this run. Set SONAR_A3S_ENABLED=true or pass --sqaa enabled to run it.',
            status: 'skipped',
          },
        ]);
        expect(report.sqaaEnabled).toBe(false);
        expect(report.status).toBe('skipped');
        expect(context.calls).toEqual([
          {
            args: ['branch', '--show-current'],
            command: 'git',
            options: { cwd: '/repo' },
          },
        ]);
      },
    },
    {
      name: 'runs no external commands when there are no changed files',
      inputs: {
        changedFiles: [],
      },
      mock: async () => {
        const runs = [];

        return {
          runs,
          runCommand: async (command, args, options) => {
            runs.push({ args, command, options });
          },
        };
      },
      assert: async (context, inputs) => {
        const report = await runSonarChangedFileAnalysis({
          changedFiles: inputs.changedFiles,
          runCommand: context.runCommand,
        });

        expect(report).toEqual({
          branch: expect.any(String),
          changedFiles: [],
          commands: [],
          project: 'vannadii_devplat',
          results: [],
          sqaaEnabled: false,
          status: 'passed',
        });
        expect(context.runs).toEqual([]);
      },
    },
    {
      name: 'runs generated SonarQube commands with repository cwd',
      inputs: {
        changedFiles: ['packages/core/src/domain/logic.ts'],
      },
      mock: async () => {
        const runs = [];

        return {
          runs,
          runCommand: async (command, args, options) => {
            runs.push({ args, command, options });
          },
        };
      },
      assert: async (context, inputs) => {
        const report = await runSonarChangedFileAnalysis({
          branch: 'feature/runtime',
          changedFiles: inputs.changedFiles,
          maxParallel: 6,
          project: 'vannadii_devplat',
          rootDirectory: '/repo',
          runCommand: context.runCommand,
          sonarCommand: 'sonar',
          sqaaMode: 'enabled',
        });

        expect(report.commands).toHaveLength(3);
        expect(report.results).toEqual([
          {
            args: ['analyze', 'secrets', 'packages/core/src/domain/logic.ts'],
            command: 'sonar',
            label: 'sonar analyze secrets packages/core/src/domain/logic.ts',
            status: 'passed',
            stderr: '',
            stdout: '',
          },
          {
            args: [
              'verify',
              '--file',
              'packages/core/src/domain/logic.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar verify packages/core/src/domain/logic.ts',
            status: 'passed',
            stderr: '',
            stdout: '',
          },
          {
            args: [
              'analyze',
              'sqaa',
              '--file',
              'packages/core/src/domain/logic.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            label: 'sonar analyze sqaa packages/core/src/domain/logic.ts',
            status: 'passed',
            stderr: '',
            stdout: '',
          },
        ]);
        expect(context.runs).toEqual([
          {
            args: ['analyze', 'secrets', 'packages/core/src/domain/logic.ts'],
            command: 'sonar',
            options: { rootDirectory: '/repo' },
          },
          {
            args: [
              'verify',
              '--file',
              'packages/core/src/domain/logic.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            options: { rootDirectory: '/repo' },
          },
          {
            args: [
              'analyze',
              'sqaa',
              '--file',
              'packages/core/src/domain/logic.ts',
              '--branch',
              'feature/runtime',
              '--project',
              'vannadii_devplat',
            ],
            command: 'sonar',
            options: { rootDirectory: '/repo' },
          },
        ]);
      },
    },
    {
      name: 'uses environment branch values before shelling out',
      inputs: {
        env: {
          GITHUB_HEAD_REF: 'feature/from-env',
        },
      },
      mock: async () => {
        const calls = [];

        return {
          calls,
          execFileImpl: async (command, args, options) => {
            calls.push({ args, command, options });

            return { stdout: 'feature/from-git\n', stderr: '' };
          },
        };
      },
      assert: async (context, inputs) => {
        await expect(
          resolveCurrentBranch({
            env: inputs.env,
            execFileImpl: context.execFileImpl,
            rootDirectory: '/repo',
          }),
        ).resolves.toBe('feature/from-env');
        expect(context.calls).toEqual([]);
      },
    },
    {
      name: 'resolves upstream branch before remote default',
      inputs: {},
      mock: async () => {
        const calls = [];
        const execFileImpl = async (command, args, options) => {
          calls.push({ args, command, options });

          if (args[0] === 'rev-parse') {
            return {
              stdout: 'origin/feature/full-autonomy-runtime\n',
              stderr: '',
            };
          }

          throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
        };

        return { calls, execFileImpl };
      },
      assert: async (context) => {
        await expect(
          resolveBaseRef({
            env: {},
            execFileImpl: context.execFileImpl,
            rootDirectory: '/repo',
          }),
        ).resolves.toBe('origin/feature/full-autonomy-runtime');
        expect(context.calls).toEqual([
          {
            args: [
              'rev-parse',
              '--abbrev-ref',
              '--symbolic-full-name',
              '@{upstream}',
            ],
            command: 'git',
            options: { cwd: '/repo' },
          },
        ]);
      },
    },
    {
      name: 'parses top-level install and analyze helper commands',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        expect(parseSonarCliHelperArgs(['install'])).toEqual({
          command: 'install',
          options: {},
        });
        expect(
          parseSonarCliHelperArgs(['analyze', '--base', 'origin/main']),
        ).toEqual({
          command: 'analyze',
          options: {
            baseRef: 'origin/main',
            headRef: 'HEAD',
            maxParallel: 4,
            outputFormat: 'text',
            project: 'vannadii_devplat',
            sonarCommand: 'sonar',
            sqaaMode: 'disabled',
          },
        });
        expect(parseSonarCliHelperArgs([])).toEqual({
          command: 'analyze',
          options: {
            headRef: 'HEAD',
            maxParallel: 4,
            outputFormat: 'text',
            project: 'vannadii_devplat',
            sonarCommand: 'sonar',
            sqaaMode: 'disabled',
          },
        });
      },
    },
    {
      name: 'parses explicit base head branch project and binary flags',
      inputs: {
        argv: [
          '--base',
          'origin/main',
          '--head',
          'HEAD',
          '--branch',
          'feature/runtime',
          '--project',
          'vannadii_devplat',
          '--sonar-command',
          '/usr/local/bin/sonar',
          '--json',
          '--max-parallel',
          '2',
          '--sqaa',
          'enabled',
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(parseSonarChangedFileArgs(inputs.argv)).toEqual({
          baseRef: 'origin/main',
          branch: 'feature/runtime',
          headRef: 'HEAD',
          maxParallel: 2,
          outputFormat: 'json',
          project: 'vannadii_devplat',
          sonarCommand: '/usr/local/bin/sonar',
          sqaaMode: 'enabled',
        });
      },
    },
    {
      name: 'parses empty args with internal branch and project defaults',
      inputs: {
        argv: [],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(parseSonarChangedFileArgs(inputs.argv)).toEqual({
          headRef: 'HEAD',
          maxParallel: 4,
          outputFormat: 'text',
          project: 'vannadii_devplat',
          sonarCommand: 'sonar',
          sqaaMode: 'disabled',
        });
      },
    },
    {
      name: 'resolves SQAA capability from mode or environment',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        expect(resolveSqaaEnabled({ env: {}, sqaaMode: 'enabled' })).toBe(true);
        expect(resolveSqaaEnabled({ env: {}, sqaaMode: 'disabled' })).toBe(
          false,
        );
        expect(
          resolveSqaaEnabled({
            env: {
              SONAR_A3S_ENABLED: 'true',
            },
          }),
        ).toBe(true);
        expect(
          resolveSqaaEnabled({
            env: {
              SONAR_A3S_ENABLED: 'false',
            },
          }),
        ).toBe(false);
      },
    },
    {
      name: 'runs changed-file commands in parallel',
      inputs: {
        changedFiles: [
          'packages/core/src/domain/logic.ts',
          'packages/config/src/load-runtime-config/logic.ts',
        ],
      },
      mock: async () => {
        const started = [];
        let releaseCommands;
        const release = new Promise((resolve) => {
          releaseCommands = resolve;
        });

        return {
          releaseCommands,
          runCommand: async (command, args) => {
            started.push({ args, command });

            if (started.length === 6) {
              releaseCommands();
            }

            await release;

            return { stderr: '', stdout: '' };
          },
          started,
        };
      },
      assert: async (context, inputs) => {
        const report = await runSonarChangedFileAnalysis({
          branch: 'feature/runtime',
          changedFiles: inputs.changedFiles,
          maxParallel: 6,
          project: 'vannadii_devplat',
          runCommand: context.runCommand,
          sqaaMode: 'enabled',
        });

        expect(context.started).toHaveLength(6);
        expect(report.results.map((result) => result.status)).toEqual([
          'passed',
          'passed',
          'passed',
          'passed',
          'passed',
          'passed',
        ]);
      },
    },
    {
      name: 'classifies disabled A3S analysis as skipped',
      inputs: {
        error: {
          stderr: 'A3S analysis is not activated for this organization\n',
          stdout: '',
        },
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(classifySonarAnalysisFailure(inputs.error)).toEqual({
          reason: 'A3S analysis is not activated for this organization',
          status: 'skipped',
        });
      },
    },
    {
      name: 'classifies retryable SonarQube service outages as skipped',
      inputs: {
        error: {
          stderr:
            'SonarQube API error: 502 Bad Gateway - The request could not be satisfied',
          stdout: '',
        },
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(classifySonarAnalysisFailure(inputs.error)).toEqual({
          reason:
            'SonarQube service unavailable during local analysis; retry this gate after the upstream service recovers.',
          status: 'skipped',
        });
      },
    },
    {
      name: 'classifies local SonarQube connectivity failures as skipped',
      inputs: {
        error: {
          stderr:
            'SonarQube Agentic Analysis failed.\nUnable to connect. Is the computer able to access the url?',
          stdout: '',
        },
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(classifySonarAnalysisFailure(inputs.error)).toEqual({
          reason:
            'SonarQube service unavailable during local analysis; retry this gate after the upstream service recovers.',
          status: 'skipped',
        });
      },
    },
    {
      name: 'formats plain text and JSON reports',
      inputs: {
        report: {
          branch: 'feature/runtime',
          changedFiles: ['packages/core/src/domain/logic.ts'],
          commands: [],
          project: 'vannadii_devplat',
          results: [
            {
              args: ['analyze', 'secrets'],
              command: 'sonar',
              label: 'sonar analyze secrets packages/core/src/domain/logic.ts',
              status: 'passed',
              stderr: '',
              stdout: '',
            },
            {
              args: ['analyze', 'sqaa'],
              command: 'sonar',
              label: 'sonar analyze sqaa packages/core/src/domain/logic.ts',
              reason: 'A3S analysis is not activated for this organization',
              status: 'skipped',
            },
          ],
          sqaaEnabled: true,
          status: 'skipped',
        },
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(formatSonarChangedFileReport(inputs.report)).toContain(
          'SonarQube CLI changed-file analysis: skipped',
        );
        expect(formatSonarChangedFileReport(inputs.report)).toContain(
          'SQAA/A3S enabled: true',
        );
        expect(formatSonarChangedFileReport(inputs.report)).toContain(
          'Results: passed 1, skipped 1, failed 0',
        );
        expect(formatSonarChangedFileReport(inputs.report)).toContain(
          'SKIP skipped: 1 command(s)',
        );
        expect(
          JSON.parse(formatSonarChangedFileReport(inputs.report, 'json')),
        ).toEqual(inputs.report);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});

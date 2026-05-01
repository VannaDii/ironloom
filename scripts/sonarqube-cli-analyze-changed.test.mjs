import { describe, expect, it } from 'vitest';

import {
  collectChangedFiles,
  createSonarCliInstallCommand,
  createSonarChangedFileCommands,
  installSonarCli,
  parseSonarCliHelperArgs,
  parseSonarChangedFileArgs,
  resolveCurrentBranch,
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
            '-o-',
            'https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh',
          ],
          command: 'curl',
          inputCommand: 'bash',
          label: 'SonarQube CLI installer',
        });
        expect(createSonarCliInstallCommand('linux')).toEqual({
          args: [
            '-o-',
            'https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh',
          ],
          command: 'curl',
          inputCommand: 'bash',
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

        expect(command.command).toBe('curl');
        expect(context.runs).toEqual([
          {
            args: [
              '-o-',
              'https://raw.githubusercontent.com/SonarSource/sonarqube-cli/refs/heads/master/user-scripts/install.sh',
            ],
            command: 'curl',
            options: {
              inputCommand: 'bash',
              rootDirectory: '/repo',
            },
          },
        ]);
      },
    },
    {
      name: 'creates one secrets scan and one SQAA scan per changed file',
      inputs: {
        branch: 'feature/runtime',
        changedFiles: [
          './packages/openclaw/src/index.ts',
          'scripts/openclaw-live-lab.mjs',
        ],
        project: 'vannadii_devplat',
        sonarCommand: 'sonar',
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const commands = createSonarChangedFileCommands(inputs);

        expect(commands).toEqual([
          {
            args: [
              'analyze',
              'secrets',
              'packages/openclaw/src/index.ts',
              'scripts/openclaw-live-lab.mjs',
            ],
            command: 'sonar',
            label: 'sonar analyze secrets',
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
          execFileImpl: context.execFileImpl,
          rootDirectory: '/repo',
          runCommand: async () => undefined,
        });

        expect(report.branch).toBe('feature/runtime');
        expect(report.project).toBe('vannadii_devplat');
        expect(report.commands[1].args).toEqual([
          'analyze',
          'sqaa',
          '--file',
          'packages/core/src/domain/logic.ts',
          '--branch',
          'feature/runtime',
          '--project',
          'vannadii_devplat',
        ]);
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
          project: 'vannadii_devplat',
          rootDirectory: '/repo',
          runCommand: context.runCommand,
          sonarCommand: 'sonar',
        });

        expect(report.commands).toHaveLength(2);
        expect(context.runs).toEqual([
          {
            args: ['analyze', 'secrets', 'packages/core/src/domain/logic.ts'],
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
            project: 'vannadii_devplat',
            sonarCommand: 'sonar',
          },
        });
        expect(parseSonarCliHelperArgs([])).toEqual({
          command: 'analyze',
          options: {
            headRef: 'HEAD',
            project: 'vannadii_devplat',
            sonarCommand: 'sonar',
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
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        expect(parseSonarChangedFileArgs(inputs.argv)).toEqual({
          baseRef: 'origin/main',
          branch: 'feature/runtime',
          headRef: 'HEAD',
          project: 'vannadii_devplat',
          sonarCommand: '/usr/local/bin/sonar',
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
          project: 'vannadii_devplat',
          sonarCommand: 'sonar',
        });
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();

    await testCase.assert(context, testCase.inputs);
  });
});

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertPartialMatch,
  buildDockerBuildArgs,
  buildDockerRunArgs,
  createDeepScenario,
  createGatewayConfig,
  createInvokeScript,
  createPluginConfig,
  createRuntimeEnv,
  parseDeepTestArgs,
  runDeepTest,
  sanitizeSnapshotForArtifacts,
  validateDeepTestReport,
} from './openclaw-deep-test.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('openclaw-deep-test helpers', () => {
  const cases = [
    {
      name: 'parses CLI flags for live mode reuse',
      inputs: {
        argv: [
          '--mode',
          'live',
          '--image',
          'ghcr.io/vannadii/devplat-openclaw:test',
          '--skip-build',
          '--report-dir',
          'artifacts/openclaw-deep',
          '--retain-container-on-failure',
        ],
      },
      mock: async () => undefined,
      assert: async (_context, inputs) => {
        const parsed = parseDeepTestArgs(inputs.argv);
        expect(parsed).toMatchObject({
          mode: 'live',
          image: 'ghcr.io/vannadii/devplat-openclaw:test',
          skipBuild: true,
          retainContainerOnFailure: true,
        });
        expect(parsed.reportDir).toContain('artifacts/openclaw-deep');
      },
    },
    {
      name: 'renders gateway and docker settings for hermetic runs',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const runtimeEnv = createRuntimeEnv();
        const pluginConfig = createPluginConfig(runtimeEnv);
        const gatewayConfig = createGatewayConfig({
          gatewayToken: 'token-1',
          pluginConfig,
        });
        const buildArgs = buildDockerBuildArgs('devplat:test');
        const runArgs = buildDockerRunArgs({
          bundledExtensionsDirectory:
            '/sandbox/openclaw-runtime/bundled-extensions',
          containerName: 'devplat-test-container',
          devplatStateDirectory: '/sandbox/devplat-state',
          imageTag: 'devplat:test',
          mode: 'hermetic',
          runtimeDirectory: '/sandbox/devplat-runtime',
        });

        expect(gatewayConfig).toMatchObject({
          gateway: {
            mode: 'local',
            bind: 'loopback',
            auth: { mode: 'token', token: 'token-1' },
          },
          plugins: {
            enabled: true,
            load: { paths: ['/app/packages/openclaw'] },
          },
        });
        expect(gatewayConfig).not.toHaveProperty('devplat');
        expect(buildArgs).toEqual([
          'build',
          '-t',
          'devplat:test',
          '-f',
          'docker/openclaw-runtime/Dockerfile',
          '.',
        ]);
        expect(runArgs).toEqual(
          expect.arrayContaining([
            '-e',
            'HOME=/state/home',
            '-e',
            'OPENCLAW_HOME=/state/openclaw-home',
            '-e',
            'TMPDIR=/state/tmp',
            '-e',
            'DEVPLAT_TEST_MODE=hermetic',
            '-v',
            '/sandbox/openclaw-runtime/bundled-extensions:/app/node_modules/openclaw/dist/extensions:ro',
            '--network',
            'none',
            'devplat:test',
            '--bind',
            'loopback',
          ]),
        );
      },
    },
    {
      name: 'defines a deep scenario and validates persisted scope coverage',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const runtimeEnv = createRuntimeEnv({
          GITHUB_REPO: 'devplat-test-101-1',
          SONAR_PROJECT_KEY: 'vannadii_devplat-test-101-1',
        });
        const scenario = createDeepScenario(runtimeEnv);

        expect(scenario).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              tool: 'resolve_runtime_config',
              phase: 'config',
            }),
            expect.objectContaining({
              tool: 'handle_discord_control',
              phase: 'control',
            }),
            expect.objectContaining({
              tool: 'validate_artifact',
              phase: 'contracts',
            }),
          ]),
        );

        expect(() =>
          validateDeepTestReport({
            mode: 'hermetic',
            persisted: {
              artifacts: ['artifact'],
              memory: ['memory'],
              state: ['state'],
              telemetry: ['telemetry'],
            },
            steps: [{ tool: 'resolve_runtime_config', ok: true }],
          }),
        ).not.toThrow();
      },
    },
    {
      name: 'matches array-valued result details structurally',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        expect(() =>
          assertPartialMatch(
            { completedSliceIds: ['slice-0', 'slice-1'] },
            { completedSliceIds: ['slice-0', 'slice-1'] },
          ),
        ).not.toThrow();
      },
    },
    {
      name: 'renders an invocable script and redacts sensitive snapshot fields',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const script = createInvokeScript({
          gatewayToken: 'gateway-token-1',
          request: {
            args: { scope: 'state' },
            tool: 'list_stored_records',
          },
        });
        const sanitized = sanitizeSnapshotForArtifacts({
          authToken: 'token-1',
          nested: {
            publicKey: 'public-key-1',
            value: 'kept',
          },
        });

        expect(script).toContain('(async () => {');
        expect(script).toContain('})().catch((error) => {');
        expect(sanitized).toEqual({
          authToken: '[redacted]',
          nested: {
            publicKey: '[redacted]',
            value: 'kept',
          },
        });
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    await testCase.mock();
    await testCase.assert({}, testCase.inputs);
  });
});

describe('runDeepTest', () => {
  const cases = [
    {
      name: 'records a passing report from mocked docker orchestration',
      inputs: {
        scenario: [
          {
            expected: { status: 'ok' },
            params: { scope: 'state' },
            phase: 'config',
            tool: 'list_stored_records',
          },
        ],
      },
      mock: async () => {
        const reportDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-openclaw-deep-test-'),
        );
        temporaryRoots.push(reportDirectory);

        const invocations = [];
        const commandRunner = async (command, args) => {
          invocations.push([command, ...args]);
          if (args[0] === 'build') {
            return { stdout: '', stderr: '' };
          }
          if (args[0] === 'run') {
            return { stdout: 'container-1\n', stderr: '' };
          }
          if (args[0] === 'exec') {
            return {
              stdout: JSON.stringify({
                status: 200,
                body: {
                  ok: true,
                  result: {
                    details: { status: 'ok', scope: 'state' },
                  },
                },
              }),
              stderr: '',
            };
          }
          if (args[0] === 'logs') {
            return { stdout: 'gateway ok\n', stderr: '' };
          }
          if (args[0] === 'rm') {
            return { stdout: '', stderr: '' };
          }

          throw new Error(`Unexpected docker args: ${args.join(' ')}`);
        };

        return { commandRunner, invocations, reportDirectory };
      },
      assert: async (context, inputs) => {
        const report = await runDeepTest(
          {
            gatewayToken: 'gateway-secret',
            mode: 'hermetic',
            reportDir: context.reportDirectory,
            runtimeEnv: createRuntimeEnv({
              DISCORD_BOT_TOKEN: 'bot-secret',
            }),
            scenario: inputs.scenario,
          },
          {
            collectStoredKeys: async () => ({
              artifacts: ['storage-openclaw-artifact-1'],
              memory: ['memory-openclaw-1'],
              state: ['session-openclaw-1'],
              telemetry: ['telemetry-openclaw-1'],
            }),
            commandRunner: context.commandRunner,
            onProgress: () => undefined,
          },
        );

        const savedReport = JSON.parse(
          await readFile(
            resolve(context.reportDirectory, 'deep-test-report.json'),
            'utf8',
          ),
        );
        const savedRuntimeEnv = await readFile(
          resolve(context.reportDirectory, 'runtime-env.json'),
          'utf8',
        );
        const savedGatewayConfig = await readFile(
          resolve(context.reportDirectory, 'runtime/openclaw.json'),
          'utf8',
        );
        const runtimeTempStats = await stat(
          resolve(context.reportDirectory, 'runtime/tmp'),
        );
        const bundledExtensionsStats = await stat(
          resolve(context.reportDirectory, 'runtime/bundled-extensions'),
        );
        const openclawHomeStats = await stat(
          resolve(context.reportDirectory, 'runtime/openclaw-home'),
        );
        const homeStats = await stat(
          resolve(context.reportDirectory, 'runtime/home'),
        );

        expect(report.steps).toHaveLength(1);
        expect(savedReport.persisted).toMatchObject({
          artifacts: ['storage-openclaw-artifact-1'],
          memory: ['memory-openclaw-1'],
        });
        expect(report.containerName).toMatch(/^devplat-openclaw-/);
        expect(report.imageTag).toMatch(/^devplat-openclaw-deep-test:/);
        expect(savedRuntimeEnv).toContain('[redacted]');
        expect(savedRuntimeEnv).not.toContain('bot-secret');
        expect(savedGatewayConfig).toContain('[redacted]');
        expect(savedGatewayConfig).not.toContain('gateway-secret');
        expect(bundledExtensionsStats.isDirectory()).toBe(true);
        expect(homeStats.isDirectory()).toBe(true);
        expect(openclawHomeStats.isDirectory()).toBe(true);
        expect(runtimeTempStats.isDirectory()).toBe(true);
        expect(context.invocations).toEqual(
          expect.arrayContaining([
            expect.arrayContaining(['docker', 'build']),
            expect.arrayContaining(['docker', 'run']),
            expect.arrayContaining(['docker', 'rm']),
          ]),
        );
      },
    },
    {
      name: 'removes the container after readiness failures',
      inputs: {},
      mock: async () => {
        const reportDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-openclaw-deep-test-fail-'),
        );
        temporaryRoots.push(reportDirectory);

        const invocations = [];
        let execAttempts = 0;
        const commandRunner = async (_command, args) => {
          invocations.push(args);
          if (args[0] === 'build') {
            return { stdout: '', stderr: '' };
          }
          if (args[0] === 'run') {
            return { stdout: 'container-1\n', stderr: '' };
          }
          if (args[0] === 'exec') {
            execAttempts += 1;
            throw new Error(`gateway not ready ${String(execAttempts)}`);
          }
          if (args[0] === 'logs') {
            return { stdout: 'startup failed\n', stderr: '' };
          }
          if (args[0] === 'rm') {
            return { stdout: '', stderr: '' };
          }

          throw new Error(`Unexpected docker args: ${args.join(' ')}`);
        };

        return { commandRunner, invocations, reportDirectory };
      },
      assert: async (context) => {
        await expect(
          runDeepTest(
            {
              mode: 'hermetic',
              readinessPollMs: 0,
              readinessTimeoutMs: 1,
              reportDir: context.reportDirectory,
              runtimeEnv: createRuntimeEnv(),
            },
            {
              commandRunner: context.commandRunner,
            },
          ),
        ).rejects.toThrow('Gateway readiness timed out');

        expect(context.invocations).toEqual(
          expect.arrayContaining([expect.arrayContaining(['rm', '-f'])]),
        );
      },
    },
    {
      name: 'scopes default runtime names to the full report path',
      inputs: {},
      mock: async () => {
        const rootDirectory = await mkdtemp(
          resolve(tmpdir(), 'devplat-openclaw-live-lab-'),
        );
        const reportDirectory = resolve(rootDirectory, 'local-7', 'deep-test');
        temporaryRoots.push(rootDirectory);

        const invocations = [];
        const commandRunner = async (_command, args) => {
          invocations.push(args);
          if (args[0] === 'build') {
            return { stdout: '', stderr: '' };
          }
          if (args[0] === 'run') {
            return { stdout: 'container-1\n', stderr: '' };
          }
          if (args[0] === 'exec') {
            return {
              stdout: JSON.stringify({
                status: 200,
                body: {
                  ok: true,
                  result: {
                    details: {
                      status: 'ok',
                    },
                  },
                },
              }),
              stderr: '',
            };
          }
          if (args[0] === 'logs') {
            return { stdout: 'gateway ok\n', stderr: '' };
          }
          if (args[0] === 'rm') {
            return { stdout: '', stderr: '' };
          }

          throw new Error(`Unexpected docker args: ${args.join(' ')}`);
        };

        return { commandRunner, invocations, reportDirectory };
      },
      assert: async (context) => {
        const report = await runDeepTest(
          {
            gatewayToken: 'gateway-secret',
            mode: 'live',
            reportDir: context.reportDirectory,
            runtimeEnv: createRuntimeEnv(),
            scenario: [
              {
                expected: { status: 'ok' },
                params: { scope: 'state' },
                phase: 'config',
                tool: 'list_stored_records',
              },
            ],
          },
          {
            collectStoredKeys: async () => ({
              artifacts: ['artifact-1'],
              memory: ['memory-1'],
              state: ['state-1'],
              telemetry: ['telemetry-1'],
            }),
            commandRunner: context.commandRunner,
            onProgress: () => undefined,
          },
        );

        expect(report.containerName).toContain('local-7-deep-test');
        expect(report.imageTag).toContain('local-7-deep-test');
        expect(context.invocations).toEqual(
          expect.arrayContaining([
            expect.arrayContaining([
              'run',
              '-d',
              '--name',
              report.containerName,
            ]),
          ]),
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const context = await testCase.mock();
    await testCase.assert(context, testCase.inputs);
  });
});

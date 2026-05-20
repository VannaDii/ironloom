import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

const dockerRunLatestScriptName = 'docker:openclaw:latest';
const dockerRunLatestRunnerPath = 'scripts/run-openclaw-runtime-latest.mjs';
const latestOpenClawRuntimeImage =
  'ghcr.io/vannadii/devplat-openclaw-runtime:latest';
const localDashboardUrl = 'http://127.0.0.1:18789/#token=mac-local-token';
const localChatUrl =
  'http://127.0.0.1:18789/chat?session=main#token=mac-local-token';
const localWebSocketUrl = 'ws://127.0.0.1:18789';
const printGatewayTokenEnvironmentKey = 'DEVPLAT_OPENCLAW_PRINT_GATEWAY_TOKEN';

/**
 * Returns the gateway-token line from a rendered local connection summary.
 */
function readGatewayTokenLine(summary) {
  return summary.split('\n').find((line) => line.startsWith('Gateway token:'));
}

describe('docker runtime npm scripts', () => {
  const cases = [
    {
      name: 'delegates the latest runtime command to a macOS-safe Node runner',
      inputs: {
        packageUrl: new URL('../package.json', import.meta.url),
        runnerUrl: new URL(
          `./${dockerRunLatestRunnerPath.replace('scripts/', '')}`,
          import.meta.url,
        ),
      },
      mock: async (inputs) => ({
        packageJson: JSON.parse(await readFile(inputs.packageUrl, 'utf8')),
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ packageJson, runner }) => {
        const script = packageJson.scripts?.[dockerRunLatestScriptName];

        expect(script).toBe(`node ${dockerRunLatestRunnerPath}`);
        expect(script).not.toEqual(expect.stringContaining('$('));
        expect(script).not.toEqual(expect.stringContaining('${'));
        expect(runner).toBeDefined();
      },
    },
    {
      name: 'builds a latest-image Docker run plan without shell expansion',
      inputs: {
        env: {
          OPENCLAW_GATEWAY_TOKEN: 'mac-local-token',
        },
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);

        expect(plan.command).toBe('docker');
        expect(plan.stateDirectory).toBe(
          '/Users/example/devplat/.devplat/docker-state',
        );
        expect(plan.args).toEqual([
          'run',
          '--rm',
          '--pull',
          'always',
          '--name',
          'devplat-openclaw-latest',
          '--user',
          '501:20',
          '-p',
          '127.0.0.1:18789:18789',
          '-e',
          'OPENCLAW_GATEWAY_TOKEN=mac-local-token',
          '-e',
          'DEVPLAT_STORAGE_ROOT=/var/lib/devplat/state',
          '-e',
          'DEVPLAT_WORKTREE_ROOT=/var/lib/devplat/worktrees',
          '-e',
          'OPENCLAW_HOME=/var/lib/devplat/openclaw-home',
          '-v',
          '/Users/example/devplat/.devplat/docker-state:/var/lib/devplat',
          latestOpenClawRuntimeImage,
          '--port',
          '18789',
          '--bind',
          'lan',
          '--auth',
          'token',
          '--token',
          'mac-local-token',
          '--allow-unconfigured',
        ]);
        expect(plan.connection).toEqual({
          chatUrl: localChatUrl,
          dashboardUrl: localDashboardUrl,
          gatewayToken: 'mac-local-token',
          gatewayTokenLabel:
            '<hidden; set DEVPLAT_OPENCLAW_PRINT_GATEWAY_TOKEN=1 to print>',
          websocketUrl: localWebSocketUrl,
        });
      },
    },
    {
      name: 'renders local connection details before Docker runtime logs',
      inputs: {
        env: {
          OPENCLAW_GATEWAY_TOKEN: 'mac-local-token',
        },
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        expect(runner.renderLatestOpenClawRuntimeConnectionSummary).toEqual(
          expect.any(Function),
        );

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);
        const summary = runner.renderLatestOpenClawRuntimeConnectionSummary(
          plan.connection,
        );

        expect(summary).toContain(
          `Gateway token: <hidden; set ${printGatewayTokenEnvironmentKey}=1 to print>`,
        );
        expect(summary).toContain(`Dashboard URL: ${localDashboardUrl}`);
        expect(summary).toContain(`Chat URL: ${localChatUrl}`);
        expect(summary).toContain(`WebSocket URL: ${localWebSocketUrl}`);
      },
    },
    {
      name: 'prints the default gateway token without an override',
      inputs: {
        env: {},
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);
        const summary = runner.renderLatestOpenClawRuntimeConnectionSummary(
          plan.connection,
        );

        expect(readGatewayTokenLine(summary)).toBe(
          'Gateway token: devplat-local',
        );
      },
    },
    {
      name: 'masks custom gateway tokens unless raw-token output is requested',
      inputs: {
        env: {
          OPENCLAW_GATEWAY_TOKEN: 'mac-local-token',
        },
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);
        const summary = runner.renderLatestOpenClawRuntimeConnectionSummary(
          plan.connection,
        );

        expect(readGatewayTokenLine(summary)).toBe(
          `Gateway token: <hidden; set ${printGatewayTokenEnvironmentKey}=1 to print>`,
        );
      },
    },
    {
      name: 'prints custom gateway tokens when raw-token output is requested',
      inputs: {
        env: {
          OPENCLAW_GATEWAY_TOKEN: 'mac-local-token',
          [printGatewayTokenEnvironmentKey]: '1',
        },
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);
        const summary = runner.renderLatestOpenClawRuntimeConnectionSummary(
          plan.connection,
        );

        expect(readGatewayTokenLine(summary)).toBe(
          'Gateway token: mac-local-token',
        );
      },
    },
    {
      name: 'writes the connection summary before starting Docker',
      inputs: {
        env: {},
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-runtime-runner-'),
        );

        return {
          inputs: {
            ...inputs,
            rootDirectory,
          },
          rootDirectory,
          runner: await import(inputs.runnerUrl).catch(() => undefined),
        };
      },
      assert: async ({ inputs, rootDirectory, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const events = [];
        await runner.runLatestOpenClawRuntime({
          ...inputs,
          commandRunner: async () => {
            events.push('run');
          },
          output: (message) => {
            events.push(message);
          },
        });

        expect(events).toHaveLength(2);
        expect(events[0]).toContain('OpenClaw local runtime connection:');
        expect(events[1]).toBe('run');

        await rm(rootDirectory, { force: true, recursive: true });
      },
    },
    {
      name: 'adds an explicit Docker platform only when requested',
      inputs: {
        env: {
          DEVPLAT_DOCKER_PLATFORM: 'linux/arm64/v8',
        },
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);

        expect(plan.args).toEqual(
          expect.arrayContaining(['--platform', 'linux/arm64/v8']),
        );
      },
    },
    {
      name: 'uses an override runtime image for unpublished macOS validation',
      inputs: {
        env: {
          DEVPLAT_OPENCLAW_RUNTIME_IMAGE:
            'ghcr.io/vannadii/devplat-openclaw-runtime:pr-74',
        },
        groupId: 20,
        rootDirectory: '/Users/example/devplat',
        runnerUrl: new URL(
          './run-openclaw-runtime-latest.mjs',
          import.meta.url,
        ),
        userId: 501,
      },
      mock: async (inputs) => ({
        inputs,
        runner: await import(inputs.runnerUrl).catch(() => undefined),
      }),
      assert: async ({ inputs, runner }) => {
        expect(runner).toBeDefined();
        if (runner === undefined) {
          return;
        }

        const plan = runner.createLatestOpenClawRuntimeDockerPlan(inputs);

        expect(plan.args).toContain(
          'ghcr.io/vannadii/devplat-openclaw-runtime:pr-74',
        );
        expect(plan.args).not.toContain(latestOpenClawRuntimeImage);
      },
    },
  ];

  it.each(cases)('$name', async ({ inputs, mock, assert }) => {
    const context = await mock(inputs);

    await assert(context, inputs);
  });
});

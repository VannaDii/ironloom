import { afterEach, describe, expect, it, vi } from 'vitest';

import devplatOpenClawPlugin, {
  PluginConfigService,
  createDevplatOpenClawTools,
  createRunGatesTool,
} from './index.js';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('openclaw plugin entry', () => {
  const cases = [
    {
      name: 'registers the documented tool surface and validates config',
      inputs: {
        config: {
          id: 'openclaw-config',
          summary: 'OpenClaw adapter layer for DevPlat.',
          status: 'approved',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          apiBaseUrl: 'https://discord.com/api/v10',
          apiVersion: 'v10',
          applicationId: 'application-1',
          categoryName: 'devplat',
          publicKey: 'public-key-1',
          botToken: 'bot-token-1',
          installScopes: ['bot', 'applications.commands'],
          requiredPermissions: [
            'ViewChannel',
            'SendMessages',
            'CreatePublicThreads',
            'CreatePrivateThreads',
            'SendMessagesInThreads',
            'ManageThreads',
            'ReadMessageHistory',
          ],
          defaultGuildId: 'guild-1',
          specChannelId: 'specs',
          implementationChannelId: 'impl',
          pullRequestChannelId: 'prs',
          auditChannelId: 'audit',
          projectManagementChannelId: 'pm',
          threadBindingMode: 'inherit-parent',
          actionGates: {
            approveThis: true,
            mergeNow: false,
            retryGates: true,
            rebaseAllDependents: false,
          },
        },
      },
      mock: async () => {
        const toolNames = [];
        devplatOpenClawPlugin.register({
          registerTool(tool) {
            toolNames.push(tool.name);
          },
        });

        return {
          toolNames,
          validation: devplatOpenClawPlugin.configSchema.validate({
            id: 'openclaw-config',
            summary: 'OpenClaw adapter layer for DevPlat.',
            status: 'approved',
            trace: [],
            updatedAt: '2026-04-04T00:00:00.000Z',
            apiBaseUrl: 'https://discord.com/api/v10',
            apiVersion: 'v10',
            applicationId: 'application-1',
            categoryName: 'devplat',
            publicKey: 'public-key-1',
            botToken: 'bot-token-1',
            installScopes: ['bot', 'applications.commands'],
            requiredPermissions: [
              'ViewChannel',
              'SendMessages',
              'CreatePublicThreads',
              'CreatePrivateThreads',
              'SendMessagesInThreads',
              'ManageThreads',
              'ReadMessageHistory',
            ],
            defaultGuildId: 'guild-1',
            specChannelId: 'specs',
            implementationChannelId: 'impl',
            pullRequestChannelId: 'prs',
            auditChannelId: 'audit',
            projectManagementChannelId: 'pm',
            threadBindingMode: 'inherit-parent',
            actionGates: {
              approveThis: true,
              mergeNow: false,
              retryGates: true,
              rebaseAllDependents: false,
            },
          }),
        };
      },
      assert: ({ toolNames, validation }) => {
        const inventoryToolNames = createDevplatOpenClawTools().map(
          (tool) => tool.name,
        );

        expect(devplatOpenClawPlugin.id).toBe('@vannadii/devplat-openclaw');
        expect(devplatOpenClawPlugin.name).toBe('DevPlat OpenClaw Adapter');
        expect(devplatOpenClawPlugin.configSchema.jsonSchema).toMatchObject({
          definitions: {
            OpenClawPluginConfig: {
              properties: expect.any(Object),
            },
          },
        });
        expect(validation.ok).toBe(true);
        expect(toolNames).toStrictEqual(inventoryToolNames);
        expect(new Set(toolNames).size).toBe(toolNames.length);
        expect(createRunGatesTool().name).toBe('run_gates');
        expect(new PluginConfigService().constructor.name).toBe(
          'PluginConfigService',
        );
      },
    },
    {
      name: 'surfaces plugin config validation errors',
      inputs: {
        config: {
          id: 'broken',
        },
      },
      mock: async ({ config }) =>
        devplatOpenClawPlugin.configSchema.validate(config),
      assert: (validation) => {
        expect(validation.ok).toBe(false);
        if (validation.ok) {
          throw new Error('Expected invalid config.');
        }
        expect(validation.errors[0]).toContain('defaultGuildId');
      },
    },
    {
      name: 'fails closed when the generated schema is not a JSON object',
      inputs: {},
      mock: async () => {
        vi.resetModules();
        vi.doMock('node:fs', () => ({
          readFileSync() {
            return '[]';
          },
        }));

        try {
          await import('./index.js');
          return null;
        } catch (error) {
          return error;
        }
      },
      assert: (error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toContain(
          'Schema plugin-config.schema.json must contain a JSON object.',
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    testCase.assert(result);
  });
});

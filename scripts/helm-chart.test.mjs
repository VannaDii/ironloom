import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRootDirectory = resolve(import.meta.dirname, '..');
const chartDirectory = resolve(repoRootDirectory, 'deploy/helm/devplat');

describe('devplat Helm chart', () => {
  const cases = [
    {
      name: 'defines typed Discord Gateway values with safe defaults',
      inputs: {
        schemaPath: resolve(chartDirectory, 'values.schema.json'),
        valuesPath: resolve(chartDirectory, 'values.yaml'),
      },
      mock: async ({ schemaPath, valuesPath }) => ({
        schema: JSON.parse(await readFile(schemaPath, 'utf8')),
        valuesYaml: await readFile(valuesPath, 'utf8'),
      }),
      assert: ({ schema, valuesYaml }) => {
        expect(schema.properties.discordGateway).toEqual({
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: {
              type: 'boolean',
            },
            url: {
              type: 'string',
              minLength: 1,
            },
            intents: {
              type: 'integer',
              minimum: 0,
            },
          },
          required: ['enabled', 'url', 'intents'],
        });
        expect(schema.required).toContain('discordGateway');
        expect(valuesYaml).toContain('discordGateway:\n  enabled: false');
        expect(valuesYaml).toContain(
          'url: wss://gateway.discord.gg/?v=10&encoding=json',
        );
        expect(valuesYaml).toContain('intents: 0');
      },
    },
    {
      name: 'renders Discord Gateway environment from chart values',
      inputs: {
        deploymentPath: resolve(chartDirectory, 'templates/deployment.yaml'),
      },
      mock: async ({ deploymentPath }) => ({
        deploymentTemplate: await readFile(deploymentPath, 'utf8'),
      }),
      assert: ({ deploymentTemplate }) => {
        expect(deploymentTemplate).toContain(
          '{{- if .Values.discordGateway.enabled -}}',
        );
        expect(deploymentTemplate).toContain('DISCORD_GATEWAY_ENABLED');
        expect(deploymentTemplate).toContain('DISCORD_GATEWAY_URL');
        expect(deploymentTemplate).toContain('DISCORD_GATEWAY_INTENTS');
        expect(deploymentTemplate).toContain(
          '(toString .Values.discordGateway.intents)',
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const result = await testCase.mock(testCase.inputs);
    testCase.assert(result, testCase.inputs);
  });
});

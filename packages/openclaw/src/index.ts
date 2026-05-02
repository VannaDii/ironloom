import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  definePluginEntry,
  type OpenClawPluginConfigSchema,
} from 'openclaw/plugin-sdk/plugin-entry';

import { decodeWithCodec } from '@vannadii/devplat-core';

import {
  OpenClawPluginConfigCodec,
  PluginConfigService,
} from './plugin-config/index.js';
import { createDevplatOpenClawTools } from './tool-surfaces/service.js';

type PluginJsonSchema = NonNullable<OpenClawPluginConfigSchema['jsonSchema']>;

function isPluginJsonSchema(value: unknown): value is PluginJsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSchema(fileName: string): PluginJsonSchema {
  const filePath = resolve(import.meta.dirname, '..', 'schemas', fileName);
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'));
  if (!isPluginJsonSchema(parsed)) {
    throw new Error(`Schema ${fileName} must contain a JSON object.`);
  }

  return parsed;
}

function validatePluginConfig(value: unknown):
  | {
      ok: true;
      value?: unknown;
    }
  | {
      ok: false;
      errors: string[];
    } {
  const decoded = decodeWithCodec(OpenClawPluginConfigCodec, value);
  if (!decoded.ok) {
    return {
      ok: false,
      errors: [decoded.error],
    };
  }

  return {
    ok: true,
    value: new PluginConfigService().execute(decoded.value),
  };
}

const configSchema: OpenClawPluginConfigSchema = {
  validate: validatePluginConfig,
  jsonSchema: readSchema('plugin-config.schema.json'),
};

const devplatOpenClawPlugin = definePluginEntry({
  id: '@vannadii/devplat-openclaw',
  name: 'DevPlat OpenClaw Adapter',
  description:
    'OpenClaw capability bridge for the DevPlat Discord-first platform.',
  configSchema,
  register(api) {
    createDevplatOpenClawTools().forEach((tool) => {
      api.registerTool(tool);
    });
  },
});

export default devplatOpenClawPlugin;

export * from './plugin-config/index.js';
export * from './tool-surfaces/index.js';

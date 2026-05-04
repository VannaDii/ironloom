import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { format } from 'prettier';

import {
  GIT_BRANCH_NAME_JSON_SCHEMA_PATTERN,
  REPOSITORY_KEY_JSON_SCHEMA_PATTERN,
} from '../packages/core/src/domain/constants.ts';
import { schemaRegistry } from './schema-registry.mjs';

const rootDirectory = resolve(import.meta.dirname, '..');
const schemaDraft = 'http://json-schema.org/draft-07/schema#';
const namedStringCodecSchemas = new Map([
  [
    'IsoTimestamp',
    {
      type: 'string',
      format: 'date-time',
    },
  ],
  [
    'GitBranchName',
    {
      type: 'string',
      pattern: GIT_BRANCH_NAME_JSON_SCHEMA_PATTERN,
    },
  ],
  [
    'RepositoryKey',
    {
      type: 'string',
      pattern: REPOSITORY_KEY_JSON_SCHEMA_PATTERN,
    },
  ],
]);

function mergeObjectSchemas(schemas) {
  const properties = {};
  const required = [];

  for (const schema of schemas) {
    if (schema.type !== 'object') {
      return { allOf: schemas };
    }

    for (const [key, value] of Object.entries(schema.properties ?? {})) {
      properties[key] = value;
    }

    for (const key of schema.required ?? []) {
      if (!required.includes(key)) {
        required.push(key);
      }
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

function literalSchema(codec) {
  return {
    const: codec.value,
  };
}

function unionSchema(codec) {
  const literalValues = codec.types
    .filter((member) => member._tag === 'LiteralType')
    .map((member) => member.value);

  if (literalValues.length === codec.types.length) {
    return {
      enum: literalValues,
    };
  }

  return {
    anyOf: codec.types.map((member) => codecToJsonSchema(member)),
  };
}

function objectSchema(codec, required) {
  return {
    type: 'object',
    properties: Object.fromEntries(
      Object.entries(codec.props).map(([key, value]) => [
        key,
        codecToJsonSchema(value),
      ]),
    ),
    required,
    additionalProperties: false,
  };
}

function codecToJsonSchema(codec) {
  const namedStringCodecSchema = namedStringCodecSchemas.get(codec.name);
  if (namedStringCodecSchema !== undefined) {
    return namedStringCodecSchema;
  }

  if (codec.name === 'PositivePullRequestNumber') {
    return {
      type: 'integer',
      minimum: 1,
    };
  }

  switch (codec._tag) {
    case 'AnyArrayType':
      return {
        type: 'array',
        items: {},
      };
    case 'AnyDictionaryType':
      return {
        type: 'object',
        additionalProperties: true,
      };
    case 'ArrayType':
    case 'ReadonlyArrayType':
      return {
        type: 'array',
        items: codecToJsonSchema(codec.type),
      };
    case 'BooleanType':
      return {
        type: 'boolean',
      };
    case 'DictionaryType':
      return {
        type: 'object',
        additionalProperties: codecToJsonSchema(codec.codomain),
      };
    case 'InterfaceType':
      return objectSchema(codec, Object.keys(codec.props));
    case 'IntersectionType':
      return mergeObjectSchemas(
        codec.types.map((member) => codecToJsonSchema(member)),
      );
    case 'LiteralType':
      return literalSchema(codec);
    case 'NullType':
      return {
        type: 'null',
      };
    case 'NumberType':
      return {
        type: 'number',
      };
    case 'PartialType':
      return objectSchema(codec, []);
    case 'StringType':
      return {
        type: 'string',
      };
    case 'UnionType':
      return unionSchema(codec);
    case 'UnknownType':
      return {};
    default:
      throw new Error(
        `Unsupported io-ts codec tag '${codec._tag}' for ${codec.name}.`,
      );
  }
}

function codecExportName(typeName) {
  if (typeName.endsWith('Schema')) {
    return `${typeName.slice(0, -'Schema'.length)}Codec`;
  }

  return `${typeName}Codec`;
}

async function loadCodec(entry) {
  const sourceUrl = pathToFileURL(
    resolve(rootDirectory, entry.sourceFile.replace('/types.ts', '/codec.ts')),
  );
  const module = await import(sourceUrl.href);
  const exportName = codecExportName(entry.typeName);
  const codec = module[exportName];

  if (codec === undefined) {
    throw new Error(
      `Schema codec export '${exportName}' was not found in ${entry.sourceFile.replace(
        '/types.ts',
        '/codec.ts',
      )}.`,
    );
  }

  return codec;
}

async function createSchema(entry) {
  const codec = await loadCodec(entry);

  return {
    $schema: schemaDraft,
    $ref: `#/definitions/${entry.typeName}`,
    definitions: {
      [entry.typeName]: codecToJsonSchema(codec),
    },
  };
}

export async function generateSchemas(options = { outDirOverride: null }) {
  for (const entry of schemaRegistry) {
    const outputPath =
      options.outDirOverride === null
        ? resolve(rootDirectory, entry.outputFile)
        : resolve(options.outDirOverride, entry.outputFile);

    const schema = await createSchema(entry);
    const rendered = await format(`${JSON.stringify(schema, null, 2)}\n`, {
      parser: 'json',
    });
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, rendered, 'utf8');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await generateSchemas();
}

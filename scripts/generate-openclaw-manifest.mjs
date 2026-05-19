import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import { format } from 'prettier';
import ts from 'typescript';

const rootDirectory = resolve(import.meta.dirname, '..');
const packageJsonPath = resolve(
  rootDirectory,
  'packages/openclaw/package.json',
);
const configSchemaPath = resolve(
  rootDirectory,
  'packages/openclaw/schemas/plugin-config.schema.json',
);
const manifestPath = resolve(
  rootDirectory,
  'packages/openclaw/openclaw.plugin.json',
);
const toolSurfacePath = resolve(
  rootDirectory,
  'packages/openclaw/src/tool-surfaces/service.ts',
);
const toolConstantsPath = resolve(
  rootDirectory,
  'packages/openclaw/src/tool-surfaces/constants.ts',
);

/**
 * Parses a TypeScript source file for generated manifest metadata extraction.
 */
function createSourceFile(filePath, sourceText) {
  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * Returns a property name when the AST node uses a static property key.
 */
function readStaticPropertyName(propertyName) {
  if (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) {
    return propertyName.text;
  }

  return undefined;
}

/**
 * Resolves a string literal or imported string constant initializer.
 */
function readStringExpressionValue(expression, constants) {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }

  if (ts.isIdentifier(expression)) {
    return constants.get(expression.text);
  }

  return undefined;
}

/**
 * Collects exported string constants used by generated tool declarations.
 */
function collectToolConstants(sourceFile) {
  const constants = new Map();

  sourceFile.forEachChild((statement) => {
    if (!ts.isVariableStatement(statement)) {
      return;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.initializer !== undefined
      ) {
        const value = readStringExpressionValue(
          declaration.initializer,
          constants,
        );
        if (value !== undefined) {
          constants.set(declaration.name.text, value);
        }
      }
    }
  });

  return constants;
}

/**
 * Reads the top-level `name` field from a tool factory's descriptor object.
 */
function readToolFactoryName(functionDeclaration, constants) {
  let toolObject;

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'tool' &&
      node.initializer !== undefined &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      toolObject = node.initializer;
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(functionDeclaration, visit);

  if (toolObject === undefined) {
    return undefined;
  }

  for (const property of toolObject.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }

    if (readStaticPropertyName(property.name) !== 'name') {
      continue;
    }

    return readStringExpressionValue(property.initializer, constants);
  }

  return undefined;
}

/**
 * Collects concrete tool factory names keyed by their factory function name.
 */
function collectToolFactoryNames(sourceFile, constants) {
  const toolFactoryNames = new Map();

  sourceFile.forEachChild((statement) => {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name !== undefined &&
      /^create[A-Z].*Tool$/u.test(statement.name.text)
    ) {
      const toolName = readToolFactoryName(statement, constants);
      if (toolName !== undefined) {
        toolFactoryNames.set(statement.name.text, toolName);
      }
    }
  });

  return toolFactoryNames;
}

/**
 * Reads the registered tool factory call order from the inventory function.
 */
function readToolInventoryFactoryNames(sourceFile) {
  let inventoryFunction;

  sourceFile.forEachChild((statement) => {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'createDevplatOpenClawTools'
    ) {
      inventoryFunction = statement;
    }
  });

  if (inventoryFunction === undefined) {
    throw new Error('Unable to find createDevplatOpenClawTools.');
  }

  let inventory;

  function visit(node) {
    if (
      inventory === undefined &&
      ts.isReturnStatement(node) &&
      node.expression !== undefined &&
      ts.isArrayLiteralExpression(node.expression)
    ) {
      inventory = node.expression;
      return;
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(inventoryFunction, visit);

  if (inventory === undefined) {
    throw new Error('Unable to find createDevplatOpenClawTools return list.');
  }

  return inventory.elements.map((element) => {
    if (ts.isCallExpression(element) && ts.isIdentifier(element.expression)) {
      return element.expression.text;
    }

    throw new Error('OpenClaw tool inventory must call named factories.');
  });
}

/**
 * Reads tool names from the source inventory used by plugin registration.
 */
export async function readDevplatOpenClawToolNames() {
  const constantsSourceFile = createSourceFile(
    toolConstantsPath,
    await readFile(toolConstantsPath, 'utf8'),
  );
  const serviceSourceFile = createSourceFile(
    toolSurfacePath,
    await readFile(toolSurfacePath, 'utf8'),
  );
  const constants = collectToolConstants(constantsSourceFile);
  const toolFactoryNames = collectToolFactoryNames(
    serviceSourceFile,
    constants,
  );

  return readToolInventoryFactoryNames(serviceSourceFile).map((factoryName) => {
    const toolName = toolFactoryNames.get(factoryName);
    if (toolName === undefined) {
      throw new Error(
        `Unable to resolve OpenClaw tool factory ${factoryName}.`,
      );
    }

    return toolName;
  });
}

export async function renderOpenClawManifest() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const configSchema = JSON.parse(await readFile(configSchemaPath, 'utf8'));
  const toolNames = await readDevplatOpenClawToolNames();

  const manifest = {
    id: '@vannadii/devplat-openclaw',
    entry: './dist/index.js',
    configSchema,
    contracts: {
      tools: toolNames,
    },
    name: 'DevPlat OpenClaw Adapter',
    version: packageJson.version,
    description:
      'DevPlat capability bridge for OpenClaw with Discord-first operational flows.',
  };

  return format(`${JSON.stringify(manifest, null, 2)}\n`, {
    parser: 'json',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = await renderOpenClawManifest();

  await writeFile(manifestPath, manifest, 'utf8');

  console.log('Generated packages/openclaw/openclaw.plugin.json');
}

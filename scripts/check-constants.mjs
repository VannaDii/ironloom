import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Repository root used when the checker is run from npm scripts.
 */
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Package source directory that owns cross-package lifecycle action constants.
 */
const sharedConstantsFilePath = 'packages/core/src/domain/constants.ts';

/**
 * Constant-name prefix for lifecycle actions that must not be redefined.
 */
const lifecycleActionConstantPrefix = 'DEVPLAT_ACTION_';

/**
 * Directories ignored while scanning authored repository files.
 */
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

/**
 * Returns true when a path is an authored TypeScript source file.
 */
function isAuthoredTypeScriptSource(filePath) {
  return (
    filePath.endsWith('.ts') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.d.ts')
  );
}

/**
 * Recursively collects files below a directory while skipping generated output.
 */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files = [];

  for (const entry of entries) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        files.push(...(await collectFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

/**
 * Parses one TypeScript file for AST-based literal checks.
 */
async function parseSourceFile(filePath) {
  const sourceText = await readFile(filePath, 'utf8');

  return ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * Walks every node in a TypeScript source file.
 */
function walkSourceFile(sourceFile, visitor) {
  function visit(node) {
    visitor(node);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Returns the exported constant name when a node defines one.
 */
function getVariableDeclarationName(node) {
  if (!ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name)) {
    return undefined;
  }

  return node.name.text;
}

/**
 * Collects shared lifecycle action literal values from the core constants file.
 */
async function collectSharedLifecycleActionLiterals(rootDirectory) {
  const filePath = resolve(rootDirectory, sharedConstantsFilePath);
  const sourceFile = await parseSourceFile(filePath).catch(() => undefined);
  const literals = new Set();

  if (sourceFile === undefined) {
    return literals;
  }

  walkSourceFile(sourceFile, (node) => {
    const declarationName = getVariableDeclarationName(node);
    if (
      declarationName?.startsWith(lifecycleActionConstantPrefix) === true &&
      node.initializer !== undefined &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      literals.add(node.initializer.text);
    }
  });

  return literals;
}

/**
 * Returns true when the source file is allowed to own shared action literals.
 */
function canOwnSharedActionLiteral(relativePath) {
  return relativePath === sharedConstantsFilePath;
}

/**
 * Reports duplicated shared lifecycle action literals outside their owner.
 */
function collectSourceFileFailures({
  lifecycleActionLiterals,
  relativePath,
  sourceFile,
}) {
  const failures = [];

  walkSourceFile(sourceFile, (node) => {
    if (
      ts.isStringLiteralLike(node) &&
      lifecycleActionLiterals.has(node.text)
    ) {
      const location = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(sourceFile),
      );
      failures.push(
        `${relativePath}:${location.line + 1}:${location.character + 1} duplicates shared lifecycle action literal ${node.text}; import the core constant instead.`,
      );
    }
  });

  return failures;
}

/**
 * Collects constants-ownership violations for repository source files.
 */
export async function collectConstantOwnershipFailures({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const lifecycleActionLiterals =
    await collectSharedLifecycleActionLiterals(rootDirectory);
  const sourceFiles = (await collectFiles(resolve(rootDirectory, 'packages')))
    .filter(isAuthoredTypeScriptSource)
    .map((filePath) => ({
      filePath,
      relativePath: relative(rootDirectory, filePath),
    }))
    .filter(({ relativePath }) => !canOwnSharedActionLiteral(relativePath));
  const failures = [];

  for (const { filePath, relativePath } of sourceFiles) {
    const sourceFile = await parseSourceFile(filePath);
    failures.push(
      ...collectSourceFileFailures({
        lifecycleActionLiterals,
        relativePath,
        sourceFile,
      }),
    );
  }

  return failures;
}

/**
 * Runs the constants ownership checker as a command-line gate.
 */
async function main() {
  const failures = await collectConstantOwnershipFailures();

  if (failures.length > 0) {
    throw new Error(
      `Constant ownership violations detected:\n${failures.join('\n')}`,
    );
  }

  console.log('Validated shared constant ownership for repository source.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

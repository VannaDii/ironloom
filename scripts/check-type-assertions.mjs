import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Repository root used by the command-line checker.
 */
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Directories ignored while walking package source.
 */
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

/**
 * Returns true when a file is authored package TypeScript source.
 */
function isAuthoredPackageTypeScriptSource(filePath) {
  return (
    filePath.endsWith('.ts') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.d.ts')
  );
}

/**
 * Recursively collects files below one directory.
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
 * Parses TypeScript source text into an AST.
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
 * Walks every AST node in one source file.
 */
function walkSourceFile(sourceFile, visitor) {
  function visit(node) {
    visitor(node);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Formats one AST node location for a repository-relative failure.
 */
function formatFailureLocation(rootDirectory, sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return `${relative(rootDirectory, sourceFile.fileName)}:${location.line + 1}:${location.character + 1}`;
}

/**
 * Collects type assertion violations from one parsed source file.
 */
function collectSourceFileFailures(rootDirectory, sourceFile) {
  const failures = [];

  walkSourceFile(sourceFile, (node) => {
    if (ts.isAsExpression(node)) {
      failures.push(
        `${formatFailureLocation(rootDirectory, sourceFile, node)} uses a TypeScript as assertion; use codec narrowing or typed control flow instead.`,
      );
      return;
    }

    if (ts.isTypeAssertionExpression(node)) {
      failures.push(
        `${formatFailureLocation(rootDirectory, sourceFile, node)} uses an angle-bracket type assertion; use codec narrowing or typed control flow instead.`,
      );
      return;
    }

    if (ts.isNonNullExpression(node)) {
      failures.push(
        `${formatFailureLocation(rootDirectory, sourceFile, node)} uses a non-null assertion; use explicit undefined handling instead.`,
      );
    }
  });

  return failures;
}

/**
 * Collects all authored package TypeScript assertion violations.
 */
export async function collectTypeAssertionFailures({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const sourceFiles = (await collectFiles(resolve(rootDirectory, 'packages')))
    .filter(isAuthoredPackageTypeScriptSource)
    .sort();
  const failures = [];

  for (const filePath of sourceFiles) {
    const sourceFile = await parseSourceFile(filePath);
    failures.push(...collectSourceFileFailures(rootDirectory, sourceFile));
  }

  return failures;
}

/**
 * Runs the type assertion checker as a command-line gate.
 */
async function main() {
  const failures = await collectTypeAssertionFailures();

  if (failures.length > 0) {
    throw new Error(
      `TypeScript assertion violations detected:\n${failures.join('\n')}`,
    );
  }

  console.log('Validated TypeScript assertion ban for package source.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

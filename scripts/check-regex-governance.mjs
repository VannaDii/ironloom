import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/**
 * Repository root used when the checker is run from npm scripts.
 */
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/**
 * Required suffix for named regular-expression constants.
 */
const regexPatternConstantSuffix = 'PATTERN';

/**
 * Directories ignored while scanning package source.
 */
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

/**
 * Returns true when a file is an authored TypeScript source file.
 */
function isAuthoredTypeScriptSource(filePath) {
  return (
    filePath.endsWith('.ts') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.d.ts')
  );
}

/**
 * Returns true when a file is a TypeScript test source file.
 */
function isTypeScriptTestSource(filePath) {
  return filePath.endsWith('.test.ts');
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
 * Parses one TypeScript file into an AST.
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
 * Walks every AST node in a source file.
 */
function walkSourceFile(sourceFile, visitor) {
  function visit(node) {
    visitor(node);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Formats a repository-relative source location.
 */
function formatFailureLocation(rootDirectory, sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return `${relative(rootDirectory, sourceFile.fileName)}:${location.line + 1}:${location.character + 1}`;
}

/**
 * Returns true when a node defines a regular expression.
 */
function isRegularExpressionNode(node) {
  return (
    ts.isRegularExpressionLiteral(node) ||
    (ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'RegExp')
  );
}

/**
 * Returns a variable declaration when a node defines a regex constant.
 */
function getRegexVariableDeclaration(node) {
  if (!ts.isVariableDeclaration(node) || node.initializer === undefined) {
    return undefined;
  }

  return isRegularExpressionNode(node.initializer) ? node : undefined;
}

/**
 * Returns the identifier name for a variable declaration when available.
 */
function getVariableDeclarationIdentifier(node) {
  return ts.isIdentifier(node.name) ? node.name.text : undefined;
}

/**
 * Returns the package directory name from a repository-relative package path.
 */
function getPackageName(relativePath) {
  const parts = relativePath.split('/');
  return parts[0] === 'packages' && parts.length > 1 ? parts[1] : undefined;
}

/**
 * Returns true when a repository-relative path is a package constants module.
 */
function isPackageConstantsFile(relativePath) {
  return relativePath.endsWith('/constants.ts');
}

/**
 * Collects every identifier referenced by package tests.
 */
async function collectPackageTestIdentifiers(rootDirectory, files) {
  const identifiersByPackageName = new Map();

  for (const filePath of files.filter(isTypeScriptTestSource)) {
    const relativePath = relative(rootDirectory, filePath);
    const packageName = getPackageName(relativePath);
    if (packageName === undefined) {
      continue;
    }

    const identifiers = identifiersByPackageName.get(packageName) ?? new Set();
    const sourceFile = await parseSourceFile(filePath);
    walkSourceFile(sourceFile, (node) => {
      if (ts.isIdentifier(node)) {
        identifiers.add(node.text);
      }
    });
    identifiersByPackageName.set(packageName, identifiers);
  }

  return identifiersByPackageName;
}

/**
 * Adds failures for regex governance rules in one source file.
 */
function collectSourceFileFailures({
  identifiersByPackageName,
  relativePath,
  rootDirectory,
  sourceFile,
}) {
  const failures = [];
  const packageName = getPackageName(relativePath);

  walkSourceFile(sourceFile, (node) => {
    if (
      isRegularExpressionNode(node) &&
      !isPackageConstantsFile(relativePath)
    ) {
      failures.push(
        `${formatFailureLocation(rootDirectory, sourceFile, node)} defines a regular expression outside constants.ts; move it to the owning constants module and test it directly.`,
      );
      return;
    }

    const declaration = getRegexVariableDeclaration(node);
    if (declaration === undefined) {
      return;
    }

    const declarationName = getVariableDeclarationIdentifier(declaration);
    if (declarationName === undefined) {
      return;
    }

    if (!declarationName.endsWith(regexPatternConstantSuffix)) {
      failures.push(
        `${formatFailureLocation(rootDirectory, sourceFile, declaration.name)} defines regex constant ${declarationName} without a PATTERN suffix.`,
      );
      return;
    }

    const identifiers =
      packageName === undefined
        ? undefined
        : identifiersByPackageName.get(packageName);
    if (identifiers?.has(declarationName) !== true) {
      failures.push(
        `${formatFailureLocation(rootDirectory, sourceFile, declaration.name)} defines regex constant ${declarationName} without a package test reference.`,
      );
    }
  });

  return failures;
}

/**
 * Collects regular-expression governance violations for package source.
 */
export async function collectRegexGovernanceFailures({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const packageFiles = await collectFiles(resolve(rootDirectory, 'packages'));
  const identifiersByPackageName = await collectPackageTestIdentifiers(
    rootDirectory,
    packageFiles,
  );
  const failures = [];

  for (const filePath of packageFiles.filter(isAuthoredTypeScriptSource)) {
    const relativePath = relative(rootDirectory, filePath);
    const sourceFile = await parseSourceFile(filePath);
    failures.push(
      ...collectSourceFileFailures({
        identifiersByPackageName,
        relativePath,
        rootDirectory,
        sourceFile,
      }),
    );
  }

  return failures;
}

/**
 * Runs the regular-expression governance checker as a command-line gate.
 */
async function main() {
  const failures = await collectRegexGovernanceFailures();

  if (failures.length > 0) {
    throw new Error(
      `Regular-expression governance violations detected:\n${failures.join('\n')}`,
    );
  }

  console.log('Validated regular-expression governance for package source.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

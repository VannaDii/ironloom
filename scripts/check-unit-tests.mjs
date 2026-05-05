import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import ts from 'typescript';

const rootDirectory = resolve(import.meta.dirname, '..');

const ignoredUnitFiles = new Set(['index.ts']);
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

/** Canonical Vitest case-table runner name for structured unit tests. */
const canonicalCaseRunnerName = '$name';

/** Human-readable canonical runner shape shown in failure messages. */
const canonicalCaseRunnerDisplay = "it.each(cases)('$name', ...)";

function isTestFile(filePath) {
  return /\.test\.(?:mjs|mts|ts)$/u.test(filePath);
}

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

function isUnitSourceFile(fileName) {
  return (
    !ignoredUnitFiles.has(fileName) &&
    fileName.endsWith('.ts') &&
    !fileName.endsWith('.test.ts') &&
    (fileName === 'logic.ts' || fileName === 'service.ts')
  );
}

async function collectUnitDirectoryFailures(packageName, unit, unitPath) {
  const unitStats = await stat(unitPath).catch(() => null);
  if (!unitStats?.isDirectory()) {
    return [];
  }

  const unitFiles = await readdir(unitPath);
  return unitFiles.filter(isUnitSourceFile).flatMap((fileName) => {
    const expectedTest = fileName.replace('.ts', '.test.ts');
    return unitFiles.includes(expectedTest)
      ? []
      : [`${packageName}/${unit}/${fileName} is missing ${expectedTest}`];
  });
}

async function collectPackageLayoutFailures(
  repositoryPackagesDirectory,
  packageName,
) {
  const srcDirectory = resolve(repositoryPackagesDirectory, packageName, 'src');
  const units = await readdir(srcDirectory).catch(() => []);
  const failures = await Promise.all(
    units.map((unit) =>
      collectUnitDirectoryFailures(
        packageName,
        unit,
        resolve(srcDirectory, unit),
      ),
    ),
  );

  return failures.flat();
}

export async function collectUnitTestLayoutFailures(
  repositoryRoot = rootDirectory,
) {
  const repositoryPackagesDirectory = resolve(repositoryRoot, 'packages');
  const packageNames = await readdir(repositoryPackagesDirectory).catch(
    () => [],
  );
  const failures = await Promise.all(
    packageNames.map((packageName) =>
      collectPackageLayoutFailures(repositoryPackagesDirectory, packageName),
    ),
  );

  return failures.flat();
}

export async function collectTestCaseStyleFailures(
  repositoryRoot = rootDirectory,
) {
  const testFiles = (await collectFiles(repositoryRoot)).filter(isTestFile);
  const failures = [];

  for (const testFile of testFiles) {
    const contents = await readFile(testFile, 'utf8');
    const relativePath = testFile.slice(repositoryRoot.length + 1);
    const requiredFragments = [
      'const cases = [',
      'inputs:',
      'mock:',
      'assert:',
    ];

    for (const fragment of requiredFragments) {
      if (!contents.includes(fragment)) {
        failures.push(`${relativePath} is missing ${fragment}`);
      }
    }

    failures.push(
      ...collectCaseRunnerFailures({
        contents,
        relativePath,
        testFile,
      }),
    );
  }

  return failures;
}

/**
 * Collects style failures for tests that skip the canonical case-table runner.
 */
function collectCaseRunnerFailures({ contents, relativePath, testFile }) {
  const sourceFile = ts.createSourceFile(
    testFile,
    contents,
    ts.ScriptTarget.Latest,
    true,
    resolveScriptKind(testFile),
  );
  const failures = [];
  let hasCanonicalRunner = false;

  walkSourceFile(sourceFile, (node) => {
    if (isAdHocCasesLoop(node)) {
      failures.push(
        `${relativePath} must use ${canonicalCaseRunnerDisplay} instead of looping over cases.`,
      );
    }

    const nonCanonicalRunnerName = getNonCanonicalCaseRunnerName(node);
    if (nonCanonicalRunnerName !== undefined) {
      failures.push(
        `${relativePath} must use ${canonicalCaseRunnerDisplay} instead of it.each(${nonCanonicalRunnerName}).`,
      );
    }

    if (isCanonicalCaseRunner(node)) {
      hasCanonicalRunner = true;
    }
  });

  if (!hasCanonicalRunner) {
    failures.push(`${relativePath} is missing ${canonicalCaseRunnerDisplay}`);
  }

  return failures;
}

/**
 * Returns the table variable name for `it.each(...)` calls that do not use
 * the canonical `cases` table.
 */
function getNonCanonicalCaseRunnerName(node) {
  if (!ts.isCallExpression(node) || !ts.isCallExpression(node.expression)) {
    return undefined;
  }

  const runnerFactory = node.expression;
  if (!ts.isPropertyAccessExpression(runnerFactory.expression)) {
    return undefined;
  }

  const receiver = runnerFactory.expression.expression;
  const firstArgument = runnerFactory.arguments[0];
  if (
    !ts.isIdentifier(receiver) ||
    receiver.text !== 'it' ||
    runnerFactory.expression.name.text !== 'each' ||
    firstArgument === undefined ||
    !ts.isIdentifier(firstArgument) ||
    firstArgument.text === 'cases'
  ) {
    return undefined;
  }

  return firstArgument.text;
}

/**
 * Resolves the TypeScript parser mode for supported test file extensions.
 */
function resolveScriptKind(filePath) {
  return filePath.endsWith('.ts') || filePath.endsWith('.mts')
    ? ts.ScriptKind.TS
    : ts.ScriptKind.JS;
}

/**
 * Visits every AST node in a source file.
 */
function walkSourceFile(sourceFile, visitor) {
  function visit(node) {
    visitor(node);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

/**
 * Detects the forbidden `for (const testCase of cases)` runner shape.
 */
function isAdHocCasesLoop(node) {
  if (!ts.isForOfStatement(node) || !ts.isIdentifier(node.expression)) {
    return false;
  }

  if (node.expression.text !== 'cases') {
    return false;
  }

  const initializer = node.initializer;
  if (!ts.isVariableDeclarationList(initializer)) {
    return false;
  }

  const [declaration] = initializer.declarations;
  return (
    declaration !== undefined &&
    ts.isIdentifier(declaration.name) &&
    declaration.name.text === 'testCase'
  );
}

/**
 * Detects the required `it.each(cases)('$name', ...)` runner shape.
 */
function isCanonicalCaseRunner(node) {
  if (!ts.isCallExpression(node)) {
    return false;
  }

  const runnerFactory = node.expression;
  if (!ts.isCallExpression(runnerFactory)) {
    return false;
  }

  return (
    isItEachCasesCall(runnerFactory) && isCaseNameLiteral(node.arguments[0])
  );
}

/**
 * Detects the inner `it.each(cases)` call expression.
 */
function isItEachCasesCall(node) {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  const receiver = node.expression.expression;
  const firstArgument = node.arguments[0];

  return (
    ts.isIdentifier(receiver) &&
    receiver.text === 'it' &&
    node.expression.name.text === 'each' &&
    firstArgument !== undefined &&
    ts.isIdentifier(firstArgument) &&
    firstArgument.text === 'cases'
  );
}

/**
 * Detects the required `$name` case-name placeholder.
 */
function isCaseNameLiteral(node) {
  return (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === canonicalCaseRunnerName
  );
}

export async function collectUnitTestFailures(repositoryRoot = rootDirectory) {
  return [
    ...(await collectUnitTestLayoutFailures(repositoryRoot)),
    ...(await collectTestCaseStyleFailures(repositoryRoot)),
  ];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const failures = await collectUnitTestFailures();

  if (failures.length > 0) {
    throw new Error(`Unit test violations:\n${failures.join('\n')}`);
  }

  console.log('All non-trivial units have required structured tests.');
}

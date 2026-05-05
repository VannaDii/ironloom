import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

/** Repository root used when this checker runs through npm scripts. */
const defaultRootDirectory = resolve(import.meta.dirname, '..');

/** Directories ignored while scanning authored package source. */
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);

/** JSDoc snippets that indicate generated placeholder wording leaked through. */
const forbiddenJSDocSnippets = [
  {
    text: 'service service',
    reason: 'remove duplicated service wording',
  },
  {
    text: 'Creates create.',
    reason: 'replace placeholder create wording with a concrete summary',
  },
  {
    text: 'Codec for exec file async.',
    reason: 'describe the helper instead of calling it a codec',
  },
  {
    text: 'Codec for devplat open claw plugin.',
    reason: 'describe the plugin entry instead of calling it a codec',
  },
  {
    text: 'Codec for config schema.',
    reason: 'describe the schema instead of calling it a codec',
  },
];

/**
 * Returns true when a file is authored TypeScript source checked for JSDoc.
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
 * Parses a TypeScript source file into an AST.
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
 * Returns the leading JSDoc comment attached to a declaration node.
 */
function getLeadingJSDocComment(sourceFile, node) {
  return (ts.getLeadingCommentRanges(sourceFile.text, node.pos) ?? [])
    .map((range) => ({
      range,
      text: sourceFile.text.slice(range.pos, range.end),
    }))
    .find((comment) => comment.text.startsWith('/**'));
}

/**
 * Formats a repository-relative source location for a missing JSDoc finding.
 */
function formatFailure({ name, node, rootDirectory, sourceFile }) {
  const location = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );

  return `${relative(rootDirectory, sourceFile.fileName)}:${location.line + 1}:${location.character + 1} ${name} is missing JSDoc.`;
}

/**
 * Formats one low-quality JSDoc finding for a declaration node.
 */
function formatQualityFailure({
  comment,
  forbiddenSnippet,
  rootDirectory,
  sourceFile,
  target,
}) {
  const location = sourceFile.getLineAndCharacterOfPosition(comment.range.pos);

  return `${relative(rootDirectory, sourceFile.fileName)}:${location.line + 1}:${location.character + 1} ${target.name} has low-quality JSDoc '${forbiddenSnippet.text}'; ${forbiddenSnippet.reason}.`;
}

/**
 * Returns the identifier name owned by a declaration node.
 */
function getDeclarationName(node) {
  return node.name !== undefined && ts.isIdentifier(node.name)
    ? node.name.text
    : undefined;
}

/**
 * Collects variable declaration names from one top-level variable statement.
 */
function getVariableStatementNames(node) {
  return node.declarationList.declarations
    .map((declaration) =>
      ts.isIdentifier(declaration.name) ? declaration.name.text : undefined,
    )
    .filter((name) => name !== undefined);
}

/**
 * Returns named top-level declarations that require JSDoc.
 */
function collectTopLevelJSDocTargets(sourceFile) {
  const targets = [];

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const name of getVariableStatementNames(statement)) {
        targets.push({ name, node: statement });
      }
      continue;
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      const name = getDeclarationName(statement);
      if (name !== undefined) {
        targets.push({ name, node: statement });
      }
    }
  }

  return targets;
}

/**
 * Returns named class members that require JSDoc.
 */
function collectClassMemberJSDocTargets(sourceFile) {
  const targets = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) {
      continue;
    }

    for (const member of statement.members) {
      if (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member)) {
        const name = getDeclarationName(member);
        if (name !== undefined) {
          targets.push({ name, node: member });
        }
      }
    }
  }

  return targets;
}

/**
 * Collects JSDoc governance failures for authored package source.
 */
export async function collectJSDocGovernanceFailures({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const packageFiles = (
    await collectFiles(resolve(rootDirectory, 'packages'))
  ).filter(isAuthoredTypeScriptSource);
  const failures = [];

  for (const filePath of packageFiles) {
    const sourceFile = await parseSourceFile(filePath);
    const targets = [
      ...collectTopLevelJSDocTargets(sourceFile),
      ...collectClassMemberJSDocTargets(sourceFile),
    ];

    for (const target of targets) {
      const comment = getLeadingJSDocComment(sourceFile, target.node);
      if (comment === undefined) {
        failures.push(
          formatFailure({
            name: target.name,
            node: target.node,
            rootDirectory,
            sourceFile,
          }),
        );
        continue;
      }

      for (const forbiddenSnippet of forbiddenJSDocSnippets) {
        if (comment.text.includes(forbiddenSnippet.text)) {
          failures.push(
            formatQualityFailure({
              comment,
              forbiddenSnippet,
              rootDirectory,
              sourceFile,
              target,
            }),
          );
        }
      }
    }
  }

  return failures;
}

/**
 * Runs the JSDoc governance checker as a command-line gate.
 */
async function main() {
  const failures = await collectJSDocGovernanceFailures();

  if (failures.length > 0) {
    throw new Error(
      `JSDoc governance violations detected:\n${failures.join('\n')}`,
    );
  }

  console.log('Validated JSDoc governance for package source.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

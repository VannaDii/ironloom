/**
 * Message emitted when a package reaches into `.devplat` outside storage.
 */
const DEVPLAT_PATH_BOUNDARY_MESSAGE =
  '.devplat paths may only be accessed from packages/storage/src.';

/**
 * Message emitted when a decorator appears outside approved adapter source.
 */
const DECORATOR_BOUNDARY_MESSAGE =
  'Decorators may only be used in approved OpenClaw or Discord source directories.';

/**
 * Message emitted when a regular expression is authored outside constants.
 */
const REGEX_PLACEMENT_MESSAGE =
  'Regular expressions must be defined in the owning constants.ts module.';

/**
 * Required suffix for named regular-expression constants.
 */
const REGEX_PATTERN_SUFFIX = 'PATTERN';

/**
 * Canonical case-table runner variable for repository tests.
 */
const CANONICAL_CASE_TABLE_NAME = 'cases';

/**
 * Canonical Vitest case-table name placeholder.
 */
const CANONICAL_CASE_NAME_PLACEHOLDER = '$name';

/**
 * Canonical case-table runner display shown in lint messages.
 */
const CANONICAL_CASE_RUNNER_DISPLAY = "it.each(cases)('$name', ...)";

/**
 * Source filename suffixes that represent repository unit tests.
 */
const TEST_FILE_SUFFIXES = ['.test.ts', '.test.mts', '.test.cts', '.test.mjs'];

/**
 * Source filename suffixes that should not be checked as authored package code.
 */
const IGNORED_SOURCE_SUFFIXES = [
  '.test.ts',
  '.test.mts',
  '.test.cts',
  '.test.mjs',
  '.d.ts',
];

/**
 * Adapter-package import rules enforced at source-file boundaries.
 */
const ADAPTER_IMPORT_RULES = new Map([
  [
    '@vannadii/devplat-openclaw',
    {
      allowedPathFragments: ['/packages/openclaw/src/'],
    },
  ],
  [
    '@vannadii/devplat-discord',
    {
      allowedPathFragments: [
        '/packages/discord/src/',
        '/packages/openclaw/src/',
      ],
    },
  ],
]);

/**
 * JSDoc snippets that indicate generated or placeholder wording leaked through.
 */
const FORBIDDEN_JSDOC_SNIPPETS = [
  {
    reason: 'remove duplicated service wording',
    text: 'service service',
  },
  {
    reason: 'replace placeholder create wording with a concrete summary',
    text: 'Creates create.',
  },
  {
    reason: 'describe the helper instead of calling it a codec',
    text: 'Codec for exec file async.',
  },
  {
    reason: 'describe the plugin entry instead of calling it a codec',
    text: 'Codec for devplat open claw plugin.',
  },
  {
    reason: 'describe the schema instead of calling it a codec',
    text: 'Codec for config schema.',
  },
];

/**
 * Local ESLint plugin that carries DevPlat-specific source governance.
 */
const devplatPlugin = {
  rules: {
    'package-policy-boundaries': createPackagePolicyBoundariesRule(),
    'regex-governance': createRegexGovernanceRule(),
    'require-authored-jsdoc': createRequireAuthoredJSDocRule(),
    'require-structured-cases': createRequireStructuredCasesRule(),
  },
};

/**
 * Creates the JSDoc governance rule.
 */
function createRequireAuthoredJSDocRule() {
  return {
    meta: {
      docs: {
        description:
          'Require authored JSDoc on package declarations and reject known placeholder wording.',
      },
      schema: [],
      type: 'problem',
    },
    create(context) {
      const sourceCode = context.sourceCode;

      return {
        ClassDeclaration(node) {
          if (!isTopLevelDeclaration(node)) {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getNamedNodeName(node),
          });
        },
        MethodDefinition(node) {
          if (node.kind === 'constructor') {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getPropertyName(node.key),
          });
        },
        PropertyDefinition(node) {
          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getPropertyName(node.key),
          });
        },
        TSAbstractMethodDefinition(node) {
          if (node.kind === 'constructor') {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getPropertyName(node.key),
          });
        },
        TSEnumDeclaration(node) {
          if (!isTopLevelDeclaration(node)) {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getNamedNodeName(node),
          });
        },
        TSInterfaceDeclaration(node) {
          if (!isTopLevelDeclaration(node)) {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getNamedNodeName(node),
          });
        },
        TSTypeAliasDeclaration(node) {
          if (!isTopLevelDeclaration(node)) {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getNamedNodeName(node),
          });
        },
        VariableDeclaration(node) {
          if (!isTopLevelDeclaration(node)) {
            return;
          }

          for (const declaration of node.declarations) {
            reportMissingOrLowQualityJSDoc({
              context,
              node,
              sourceCode,
              targetName: getPropertyName(declaration.id),
            });
          }
        },
        FunctionDeclaration(node) {
          if (!isTopLevelDeclaration(node)) {
            return;
          }

          reportMissingOrLowQualityJSDoc({
            context,
            node,
            sourceCode,
            targetName: getNamedNodeName(node),
          });
        },
      };
    },
  };
}

/**
 * Creates the structured case-table rule.
 */
function createRequireStructuredCasesRule() {
  return {
    meta: {
      docs: {
        description:
          'Require repository tests to use the canonical const cases table and it.each runner.',
      },
      schema: [],
      type: 'problem',
    },
    create(context) {
      const state = {
        hasAssertKey: false,
        hasCasesDeclaration: false,
        hasCanonicalRunner: false,
        hasInputsKey: false,
        hasMockKey: false,
      };

      return {
        ForOfStatement(node) {
          if (isAdHocCasesLoop(node)) {
            context.report({
              message: `Use ${CANONICAL_CASE_RUNNER_DISPLAY} instead of looping over cases.`,
              node,
            });
          }
        },
        Property(node) {
          trackCaseProperty(state, node.key);
        },
        VariableDeclarator(node) {
          if (getPropertyName(node.id) === CANONICAL_CASE_TABLE_NAME) {
            state.hasCasesDeclaration = true;
          }
        },
        CallExpression(node) {
          if (isCanonicalCaseRunner(node)) {
            state.hasCanonicalRunner = true;
          }

          const nonCanonicalRunnerName = getNonCanonicalCaseRunnerName(node);
          if (nonCanonicalRunnerName !== undefined) {
            context.report({
              message: `Use ${CANONICAL_CASE_RUNNER_DISPLAY} instead of it.each(${nonCanonicalRunnerName}).`,
              node,
            });
          }
        },
        'Program:exit'(node) {
          reportStructuredCaseProgramFailures({ context, node, state });
        },
      };
    },
  };
}

/**
 * Creates the regular-expression governance rule.
 */
function createRegexGovernanceRule() {
  return {
    meta: {
      docs: {
        description:
          'Require regex definitions to live in constants.ts and use named PATTERN constants.',
      },
      schema: [],
      type: 'problem',
    },
    create(context) {
      return {
        Literal(node) {
          if (node.regex !== undefined) {
            reportRegexPlacement({ context, node });
          }
        },
        NewExpression(node) {
          if (getNamedNodeName(node.callee) === 'RegExp') {
            reportRegexPlacement({ context, node });
          }
        },
        VariableDeclarator(node) {
          if (
            !isConstantsFile(context.filename) ||
            !isRegexExpression(node.init)
          ) {
            return;
          }

          const constantName = getPropertyName(node.id);
          if (
            constantName !== undefined &&
            !constantName.endsWith(REGEX_PATTERN_SUFFIX)
          ) {
            context.report({
              message: 'Regex constants must use the PATTERN suffix.',
              node: node.id,
            });
          }
        },
      };
    },
  };
}

/**
 * Creates the package policy boundary rule.
 */
function createPackagePolicyBoundariesRule() {
  return {
    meta: {
      docs: {
        description:
          'Keep storage paths, adapter imports, and decorators inside approved package boundaries.',
      },
      schema: [],
      type: 'problem',
    },
    create(context) {
      return {
        Decorator(node) {
          if (!isDecoratorAllowed(context.filename)) {
            context.report({
              message: DECORATOR_BOUNDARY_MESSAGE,
              node,
            });
          }
        },
        ExportNamedDeclaration(node) {
          reportAdapterImportViolation({ context, node });
        },
        ImportDeclaration(node) {
          reportAdapterImportViolation({ context, node });
        },
        Literal(node) {
          reportDevplatPathViolation({ context, node });
        },
        TemplateElement(node) {
          reportDevplatPathViolation({ context, node });
        },
      };
    },
  };
}

/**
 * Reports missing or low-quality JSDoc for one named declaration.
 */
function reportMissingOrLowQualityJSDoc({
  context,
  node,
  sourceCode,
  targetName,
}) {
  if (!isAuthoredPackageSource(context.filename) || targetName === undefined) {
    return;
  }

  const jsdocComment = findLeadingJSDocComment({ node, sourceCode });
  if (jsdocComment === undefined) {
    context.report({
      message: `${targetName} is missing JSDoc.`,
      node,
    });
    return;
  }

  for (const forbiddenSnippet of FORBIDDEN_JSDOC_SNIPPETS) {
    if (jsdocComment.value.includes(forbiddenSnippet.text)) {
      context.report({
        message: `${targetName} has low-quality JSDoc '${forbiddenSnippet.text}'; ${forbiddenSnippet.reason}.`,
        node,
      });
    }
  }
}

/**
 * Finds the leading JSDoc block directly before one node.
 */
function findLeadingJSDocComment({ node, sourceCode }) {
  const parentComments =
    node.parent === undefined ? [] : sourceCode.getCommentsBefore(node.parent);
  return [...sourceCode.getCommentsBefore(node), ...parentComments].find(
    (comment) => comment.type === 'Block' && comment.value.startsWith('*'),
  );
}

/**
 * Returns true when a declaration is a source-file statement or direct export.
 */
function isTopLevelDeclaration(node) {
  switch (node.parent?.type) {
    case 'Program':
    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration':
      return true;
    default:
      return false;
  }
}

/**
 * Reports missing structured case-table elements at program exit.
 */
function reportStructuredCaseProgramFailures({ context, node, state }) {
  if (!isTestFile(context.filename)) {
    return;
  }

  const requiredProperties = [
    [state.hasCasesDeclaration, 'const cases = ['],
    [state.hasInputsKey, 'inputs:'],
    [state.hasMockKey, 'mock:'],
    [state.hasAssertKey, 'assert:'],
  ];

  for (const [isPresent, display] of requiredProperties) {
    if (!isPresent) {
      context.report({
        message: `Test files must include ${display}.`,
        node,
      });
    }
  }

  if (!state.hasCanonicalRunner) {
    context.report({
      message: `Test files must include ${CANONICAL_CASE_RUNNER_DISPLAY}.`,
      node,
    });
  }
}

/**
 * Tracks required property keys found in case-table objects.
 */
function trackCaseProperty(state, key) {
  switch (getPropertyName(key)) {
    case 'assert':
      state.hasAssertKey = true;
      break;
    case 'inputs':
      state.hasInputsKey = true;
      break;
    case 'mock':
      state.hasMockKey = true;
      break;
    default:
      break;
  }
}

/**
 * Reports a regular expression when it is outside a constants module.
 */
function reportRegexPlacement({ context, node }) {
  if (
    !isAuthoredPackageSource(context.filename) ||
    isConstantsFile(context.filename)
  ) {
    return;
  }

  context.report({
    message: REGEX_PLACEMENT_MESSAGE,
    node,
  });
}

/**
 * Reports an adapter import when the current file is not allowed to reference it.
 */
function reportAdapterImportViolation({ context, node }) {
  const moduleSpecifier = getImportSourceValue(node.source);
  if (moduleSpecifier === undefined) {
    return;
  }

  const rule = ADAPTER_IMPORT_RULES.get(moduleSpecifier);
  if (rule === undefined) {
    return;
  }

  if (
    rule.allowedPathFragments.some((pathFragment) =>
      hasPathFragment(context.filename, pathFragment),
    )
  ) {
    return;
  }

  context.report({
    message: `Adapter package '${moduleSpecifier}' may only be imported from approved adapter source.`,
    node,
  });
}

/**
 * Reports direct `.devplat` path strings outside storage source.
 */
function reportDevplatPathViolation({ context, node }) {
  const value = getStringNodeValue(node);
  if (
    value === undefined ||
    !value.includes('.devplat') ||
    hasPathFragment(context.filename, '/packages/storage/src/')
  ) {
    return;
  }

  context.report({
    message: DEVPLAT_PATH_BOUNDARY_MESSAGE,
    node,
  });
}

/**
 * Returns true when a path is authored package source.
 */
function isAuthoredPackageSource(filename) {
  return (
    hasPathFragment(filename, 'packages/') &&
    hasPathFragment(filename, '/src/') &&
    !IGNORED_SOURCE_SUFFIXES.some((suffix) => filename.endsWith(suffix))
  );
}

/**
 * Returns true when a path is a repository test file.
 */
function isTestFile(filename) {
  return TEST_FILE_SUFFIXES.some((suffix) => filename.endsWith(suffix));
}

/**
 * Returns true when a path is a package constants module.
 */
function isConstantsFile(filename) {
  return filename.endsWith('/constants.ts');
}

/**
 * Returns true when a filename contains a repository-normalized path fragment.
 */
function hasPathFragment(filename, pathFragment) {
  const normalizedFilename = filename.split('\\').join('/');
  return (
    normalizedFilename.includes(pathFragment) ||
    normalizedFilename.includes(
      pathFragment.startsWith('/') ? pathFragment.slice(1) : `/${pathFragment}`,
    )
  );
}

/**
 * Returns true when decorators are allowed in a source file.
 */
function isDecoratorAllowed(filename) {
  return (
    hasPathFragment(filename, '/packages/discord/src/') ||
    hasPathFragment(filename, '/packages/openclaw/src/')
  );
}

/**
 * Returns true when a node expression defines a regular expression.
 */
function isRegexExpression(node) {
  if (node === null) {
    return false;
  }

  switch (node.type) {
    case 'Literal':
      return node.regex !== undefined;
    case 'NewExpression':
      return getNamedNodeName(node.callee) === 'RegExp';
    default:
      return false;
  }
}

/**
 * Detects a forbidden `for (const testCase of cases)` shape.
 */
function isAdHocCasesLoop(node) {
  const left = node.left;
  return (
    getNamedNodeName(node.right) === CANONICAL_CASE_TABLE_NAME &&
    left.type === 'VariableDeclaration' &&
    left.declarations.some(
      (declaration) => getPropertyName(declaration.id) === 'testCase',
    )
  );
}

/**
 * Returns the non-canonical table name for `it.each(<name>)` calls.
 */
function getNonCanonicalCaseRunnerName(node) {
  const runnerFactory = node.callee;
  if (
    runnerFactory.type !== 'MemberExpression' ||
    getNamedNodeName(runnerFactory.object) !== 'it' ||
    getPropertyName(runnerFactory.property) !== 'each'
  ) {
    return undefined;
  }

  const [firstArgument] = node.arguments;
  const tableName = getNamedNodeName(firstArgument);
  return tableName !== undefined && tableName !== CANONICAL_CASE_TABLE_NAME
    ? tableName
    : undefined;
}

/**
 * Detects the canonical `it.each(cases)('$name', ...)` runner.
 */
function isCanonicalCaseRunner(node) {
  const runnerFactory = node.callee;
  if (
    runnerFactory.type !== 'CallExpression' ||
    !isItEachCasesFactory(runnerFactory)
  ) {
    return false;
  }

  const [firstArgument] = node.arguments;
  return (
    getLiteralStringValue(firstArgument) === CANONICAL_CASE_NAME_PLACEHOLDER
  );
}

/**
 * Detects the inner `it.each(cases)` call.
 */
function isItEachCasesFactory(node) {
  const callee = node.callee;
  const [firstArgument] = node.arguments;

  return (
    callee.type === 'MemberExpression' &&
    getNamedNodeName(callee.object) === 'it' &&
    getPropertyName(callee.property) === 'each' &&
    getNamedNodeName(firstArgument) === CANONICAL_CASE_TABLE_NAME
  );
}

/**
 * Reads a declaration or expression identifier name when available.
 */
function getNamedNodeName(node) {
  if (node === null || node === undefined) {
    return undefined;
  }

  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSEnumDeclaration':
      return node.id?.name;
    default:
      return undefined;
  }
}

/**
 * Reads a property key name from common ESTree node shapes.
 */
function getPropertyName(node) {
  if (node === null || node === undefined) {
    return undefined;
  }

  switch (node.type) {
    case 'Identifier':
      return node.name;
    case 'Literal':
      return typeof node.value === 'string' ? node.value : undefined;
    default:
      return undefined;
  }
}

/**
 * Reads a literal or template string value from an AST node.
 */
function getStringNodeValue(node) {
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? node.value : undefined;
    case 'TemplateElement':
      return node.value.raw;
    default:
      return undefined;
  }
}

/**
 * Reads a literal string value from one AST node.
 */
function getLiteralStringValue(node) {
  return node !== undefined &&
    node.type === 'Literal' &&
    typeof node.value === 'string'
    ? node.value
    : undefined;
}

/**
 * Reads an import or export source string.
 */
function getImportSourceValue(node) {
  return node !== null &&
    node.type === 'Literal' &&
    typeof node.value === 'string'
    ? node.value
    : undefined;
}

export default devplatPlugin;

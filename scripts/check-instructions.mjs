import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRootDirectory = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const installedTypeScriptVersion = require('typescript/package.json').version;
/**
 * Matches the leading `v` in the repository Node.js version pin.
 */
const NODE_VERSION_PREFIX_PATTERN = /^v/u;
/**
 * Extracts the OpenClaw README tool list section.
 */
const OPENCLAW_README_TOOL_SECTION_PATTERN =
  /## Exposed Tools\n\n([\s\S]*?)\n## /u;
/**
 * Extracts a documented OpenClaw tool name from a README bullet.
 */
const OPENCLAW_README_TOOL_LINE_PATTERN = /^- `([^`]+)`: /gmu;
/**
 * Detects inline OpenClaw tool registration calls.
 */
const OPENCLAW_DIRECT_REGISTRATION_PATTERN =
  /api\.registerTool\((create[A-Za-z0-9]+Tool)\(\)\);/gu;
/**
 * Extracts exported OpenClaw tool factories and literal tool names.
 */
const OPENCLAW_FACTORY_LITERAL_TOOL_NAME_PATTERN =
  /export function (create[A-Za-z0-9]+Tool)(?:(?!\nexport function create[A-Za-z0-9]+Tool)[\s\S])*?name:\s*'([^']+)'/gu;
/**
 * Extracts exported OpenClaw tool factories and constant-backed tool names.
 */
const OPENCLAW_FACTORY_CONSTANT_TOOL_NAME_PATTERN =
  /export function (create[A-Za-z0-9]+Tool)(?:(?!\nexport function create[A-Za-z0-9]+Tool)[\s\S])*?name:\s*([A-Z0-9_]+),/gu;
/**
 * Extracts string constants that can own shared OpenClaw tool vocabulary.
 */
const OPENCLAW_STRING_CONSTANT_PATTERN =
  /export const ([A-Z0-9_]+) =\s*'([^']+)';/gu;
/**
 * Detects use of the centralized OpenClaw tool inventory factory.
 */
const OPENCLAW_TOOL_INVENTORY_CALL_PATTERN =
  /\bcreateDevplatOpenClawTools\(\)/u;
/**
 * Extracts the body of the centralized OpenClaw tool inventory factory.
 */
const OPENCLAW_TOOL_INVENTORY_BODY_PATTERN =
  /export function createDevplatOpenClawTools\(\): AnyAgentTool\[\] \{\s*return \[([\s\S]*?)\];\s*\}/u;
/**
 * Extracts factory calls from the centralized OpenClaw tool inventory body.
 */
const OPENCLAW_INVENTORY_FACTORY_PATTERN = /\b(create[A-Za-z0-9]+Tool)\(\)/gu;
/**
 * Escapes characters that are special inside regular expressions.
 */
const REGEXP_SPECIAL_CHARACTERS_PATTERN = /[.*+?^${}()|[\]\\]/gu;

export const REQUIRED_INSTRUCTION_FILES = [
  'AGENTS.md',
  'CONTRIBUTING.md',
  'PLATFORM.md',
  'README.md',
  '.github/copilot-instructions.md',
  '.github/instructions/architecture.instructions.md',
  '.github/instructions/artifacts.instructions.md',
  '.github/instructions/compatibility.instructions.md',
  '.github/instructions/discord.instructions.md',
  '.github/instructions/github.instructions.md',
  '.github/instructions/openclaw.instructions.md',
  '.github/instructions/performance.instructions.md',
  '.github/instructions/platform.instructions.md',
  '.github/instructions/release.instructions.md',
  '.github/instructions/reviews.instructions.md',
  '.github/instructions/schemas.instructions.md',
  '.github/instructions/testing.instructions.md',
  '.github/ISSUE_TEMPLATE/bug-report.yml',
  '.github/ISSUE_TEMPLATE/feature-request.yml',
  '.github/pull_request_template.md',
  'site/guide-docs/index.md',
  'site/guide-docs/.vitepress/config.mts',
  'site/guide-docs/guides/introduction.md',
  'site/guide-docs/guides/architecture.md',
  'site/guide-docs/guides/configuration-reference.md',
  'site/guide-docs/guides/developer-guide.md',
  'site/guide-docs/guides/discord-workflows.md',
  'site/guide-docs/guides/docker-usage.md',
  'site/guide-docs/guides/examples.md',
  'site/guide-docs/guides/helm-k3s-deployment.md',
  'site/guide-docs/guides/live-test-cleanup-and-concurrency.md',
  'site/guide-docs/guides/live-test-discord-setup.md',
  'site/guide-docs/guides/live-test-github-setup.md',
  'site/guide-docs/guides/live-test-lab.md',
  'site/guide-docs/guides/live-test-sonar-setup.md',
  'site/guide-docs/guides/openclaw-setup.md',
  'site/guide-docs/guides/operator-guide.md',
  'site/guide-docs/guides/package-reference.md',
  'site/guide-docs/guides/platform-lifecycle.md',
  'site/guide-docs/guides/quality-performance-policy.md',
  'site/guide-docs/guides/sonarcloud-integration.md',
  'packages/openclaw/README.md',
  'packages/openclaw/src/index.ts',
  'packages/openclaw/src/tool-surfaces/constants.ts',
  'packages/openclaw/src/tool-surfaces/service.ts',
];

export const REQUIRED_WORKFLOW_FILES = [
  '.github/workflows/ci.yml',
  '.github/workflows/docker-publish.yml',
  '.github/workflows/docs-deploy.yml',
  '.github/workflows/helm-publish.yml',
  '.github/workflows/openclaw-live-lab-janitor.yml',
  '.github/workflows/openclaw-live-lab.yml',
  '.github/workflows/publish-release.yml',
  '.github/workflows/release.yml',
  '.github/workflows/sonar-bootstrap-check.yml',
  '.github/workflows/typescript-matrix.yml',
];

export const REQUIRED_PLATFORM_PACKAGES = [
  '@vannadii/devplat-core',
  '@vannadii/devplat-config',
  '@vannadii/devplat-artifacts',
  '@vannadii/devplat-memory',
  '@vannadii/devplat-research',
  '@vannadii/devplat-specs',
  '@vannadii/devplat-slicing',
  '@vannadii/devplat-queue',
  '@vannadii/devplat-worktrees',
  '@vannadii/devplat-execution',
  '@vannadii/devplat-gates',
  '@vannadii/devplat-sonarcloud',
  '@vannadii/devplat-review',
  '@vannadii/devplat-remediation',
  '@vannadii/devplat-prs',
  '@vannadii/devplat-branching',
  '@vannadii/devplat-supervisor',
  '@vannadii/devplat-observability',
  '@vannadii/devplat-github',
  '@vannadii/devplat-discord',
  '@vannadii/devplat-policy',
  '@vannadii/devplat-storage',
  '@vannadii/devplat-openclaw',
];

export const REQUIRED_OPENCLAW_TOOLS = [
  'create_research_brief',
  'create_spec_record',
  'approve_spec_record',
  'create_slice_plan',
  'create_task_record',
  'claim_task',
  'update_task',
  'allocate_worktree',
  'run_gates',
  'validate_artifact',
  'create_review_finding',
  'create_remediation_plan',
  'create_pull_request_record',
  'submit_pull_request_update',
  'plan_rebase_dependents',
  'run_supervisor_step',
  'bind_discord_thread',
  'open_discord_thread',
  'handle_discord_approval',
  'handle_discord_control',
];

export const REQUIRED_HEADINGS = new Map([
  [
    'AGENTS.md',
    ['## Non-negotiable Rules', '## Boundaries', '## Delivery Contract'],
  ],
  [
    'CONTRIBUTING.md',
    [
      '## Runtime Baseline',
      '## Workflow Contract',
      '## Package Contract',
      '## Validation',
      '## Review and Release',
      '## Merge Readiness',
    ],
  ],
  [
    'PLATFORM.md',
    [
      '## Summary',
      '## Goals',
      '## Non-goals',
      '## Technology Standards',
      '## Package Responsibilities',
      '## OpenClaw Adapter Requirements',
      '## Discord Workflow Model',
      '## Acceptance Criteria',
      '## Implementation Phases',
      '## Final Principle',
    ],
  ],
  [
    '.github/copilot-instructions.md',
    [
      '## Operating Rules',
      '## Architectural Boundaries',
      '## Completion Standard',
    ],
  ],
  [
    '.github/instructions/platform.instructions.md',
    [
      '## Objective',
      '## Non-goals',
      '## Platform Model',
      '## Preserved Repo Invariants',
      '## Implementation Posture',
      '## Foundation Phases',
      '## Acceptance Discipline',
    ],
  ],
  [
    '.github/instructions/openclaw.instructions.md',
    [
      '## Adapter Contract',
      '## Required Tool Surface',
      '## State and Control',
      '## Delivery Context',
    ],
  ],
  [
    '.github/instructions/discord.instructions.md',
    [
      '## Control Plane Role',
      '## Thread Context',
      '## Operator Actions',
      '## Operational Rules',
      '## Audit Trail',
    ],
  ],
  [
    '.github/instructions/github.instructions.md',
    [
      '## Source of Truth',
      '## Pull Request Model',
      '## Review and Merge',
      '## Release Provenance',
    ],
  ],
  [
    '.github/instructions/performance.instructions.md',
    ['## Performance Standards', '## Hot Paths', '## Benchmark Policy'],
  ],
  [
    '.github/instructions/release.instructions.md',
    [
      '## Release Surfaces',
      '## Publication Guardrails',
      '## Manual Dispatch',
      '## Rollback',
    ],
  ],
  [
    '.github/instructions/compatibility.instructions.md',
    [
      '## Runtime Baseline',
      '## TypeScript Policy',
      '## Compatibility Matrix',
      '## Explicit Non-goals',
    ],
  ],
  [
    'README.md',
    [
      '## Platform Model',
      '## Runtime Baseline',
      '## Baseline Commands',
      '## Instruction Surfaces',
    ],
  ],
  [
    'site/guide-docs/guides/developer-guide.md',
    [
      '## Daily Loop',
      '## Repository Validation',
      '## Instruction Taxonomy',
      '## Package Contract',
      '## Complete Change Standard',
    ],
  ],
  [
    'site/guide-docs/guides/platform-lifecycle.md',
    [
      '## End-to-End Flow',
      '## Source of Truth',
      '## Foundation Phases',
      '## Completion Standard',
      '## Acceptance Criteria',
    ],
  ],
  [
    'site/guide-docs/guides/quality-performance-policy.md',
    [
      '## Complete Change Standard',
      '## Performance Expectations',
      '## Benchmark Policy',
    ],
  ],
  [
    '.github/pull_request_template.md',
    [
      '### Behavioral Change',
      '### Performance Impact',
      '### Rollback Notes',
      '## Validation Performed',
    ],
  ],
  [
    'packages/openclaw/README.md',
    ['## Package Assets', '## Exposed Tools', '## Deterministic Generation'],
  ],
  [
    'site/guide-docs/guides/package-reference.md',
    [
      '## Core Contracts',
      '## Workflow Packages',
      '## Integration Packages',
      '## Adapter Package',
    ],
  ],
]);

export const LINUX_COMPATIBILITY_SENTENCE =
  'Compatibility validation runs on Linux only against the latest stable TypeScript `5.x` and `6.x` releases.';
/**
 * Workflow file that carries shared artifacts between CI jobs.
 */
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
/**
 * GitHub Actions expression that changes when a workflow run is retried.
 */
const GITHUB_RUN_ATTEMPT_EXPRESSION = '${{ github.run_attempt }}';
/**
 * Shared CI artifacts that downstream jobs or operators expect to survive failed-job reruns.
 */
const RERUN_STABLE_CI_ARTIFACT_PREFIXES = [
  'schemas',
  'coverage',
  'build',
  'docs',
];
/**
 * Upload-artifact option required when artifact names stay stable across reruns.
 */
const ARTIFACT_OVERWRITE_DECLARATION = 'overwrite: true';
/**
 * Workflow step marker used to isolate one GitHub Actions step block.
 */
const GITHUB_WORKFLOW_STEP_PREFIX = '- name:';
/**
 * GitHub Action used for shared CI artifact uploads.
 */
const GITHUB_UPLOAD_ARTIFACT_ACTION = 'uses: actions/upload-artifact@';

export async function collectInstructionErrors({
  rootDirectory = defaultRootDirectory,
} = {}) {
  const errors = [];
  const versionContext = await getInstructionVersionContext(rootDirectory);
  const fileContents = await loadRequiredFileContents({
    errors,
    label: 'instruction surface',
    relativePaths: REQUIRED_INSTRUCTION_FILES,
    rootDirectory,
  });

  await validateRequiredPaths({
    errors,
    label: 'workflow surface',
    relativePaths: REQUIRED_WORKFLOW_FILES,
    rootDirectory,
  });
  validateRequiredHeadings({ errors, fileContents });
  validateRequiredText({
    errors,
    fileContents,
    ...versionContext,
  });

  const docsConfig = fileContents.get('site/guide-docs/.vitepress/config.mts');
  if (docsConfig !== undefined) {
    validateDocsNavigation(docsConfig, errors);
  }

  validatePlatformScope(fileContents, errors);
  await validateCiArtifactRerunSafety(rootDirectory, errors);
  await validateOpenClawToolDocumentation(rootDirectory, errors);

  return errors;
}

async function getInstructionVersionContext(rootDirectory) {
  const packageJsonPath = resolve(rootDirectory, 'package.json');
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  const expectedNodeVersion = String(
    await readFile(resolve(rootDirectory, '.nvmrc'), 'utf8'),
  ).trim();

  return {
    expectedNodeVersion,
    expectedPackageManager: String(packageJson.packageManager ?? ''),
    expectedTypeScriptVersion: installedTypeScriptVersion,
    normalizedNodeVersion: expectedNodeVersion.replace(
      NODE_VERSION_PREFIX_PATTERN,
      '',
    ),
  };
}

async function loadRequiredFileContents({
  errors,
  label,
  relativePaths,
  rootDirectory,
}) {
  const fileContents = new Map();

  for (const relativePath of relativePaths) {
    if (!(await pathExists(resolve(rootDirectory, relativePath)))) {
      errors.push(`Missing required ${label}: ${relativePath}`);
      continue;
    }

    fileContents.set(
      relativePath,
      await readFile(resolve(rootDirectory, relativePath), 'utf8'),
    );
  }

  return fileContents;
}

async function validateRequiredPaths({
  errors,
  label,
  relativePaths,
  rootDirectory,
}) {
  for (const relativePath of relativePaths) {
    if (!(await pathExists(resolve(rootDirectory, relativePath)))) {
      errors.push(`Missing required ${label}: ${relativePath}`);
    }
  }
}

function validateRequiredHeadings({ errors, fileContents }) {
  for (const [relativePath, headings] of REQUIRED_HEADINGS) {
    const content = fileContents.get(relativePath);
    if (content === undefined) {
      continue;
    }

    for (const heading of headings) {
      if (!hasExactLine(content, heading)) {
        errors.push(
          `${relativePath} is missing required heading '${heading}'.`,
        );
      }
    }
  }
}

function validateRequiredText({
  errors,
  expectedNodeVersion,
  expectedPackageManager,
  expectedTypeScriptVersion,
  fileContents,
  normalizedNodeVersion,
}) {
  for (const rule of buildRequiredTextRules({
    expectedNodeVersion,
    normalizedNodeVersion,
    expectedPackageManager,
    expectedTypeScriptVersion,
  })) {
    const content = fileContents.get(rule.path);
    if (content === undefined) {
      continue;
    }

    for (const requiredText of rule.requiredText) {
      if (!content.includes(requiredText)) {
        errors.push(`${rule.path} is missing required text '${requiredText}'.`);
      }
    }
  }
}

/**
 * Splits a workflow into step-sized blocks without depending on key ordering.
 */
function collectWorkflowStepBlocks(workflowContent) {
  const blocks = [];
  let currentBlock = [];

  for (const line of workflowContent.split('\n')) {
    if (
      line.trimStart().startsWith(GITHUB_WORKFLOW_STEP_PREFIX) &&
      currentBlock.length > 0
    ) {
      blocks.push(currentBlock);
      currentBlock = [];
    }

    currentBlock.push(line);
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

/**
 * Checks whether a workflow step uses the GitHub upload-artifact action.
 */
function isUploadArtifactStep(block) {
  return block.some((line) =>
    line.trimStart().startsWith(GITHUB_UPLOAD_ARTIFACT_ACTION),
  );
}

/**
 * Checks whether a workflow step declares a specific artifact name.
 */
function hasArtifactName(block, artifactNameLine) {
  return block.some((line) => line.trim() === artifactNameLine);
}

/**
 * Finds the artifact name line for a shared CI artifact prefix.
 */
function findSharedArtifactNameLine(block, artifactPrefix) {
  return block
    .map((line) => line.trim())
    .find((line) => line.startsWith(`name: ${artifactPrefix}-`));
}

/**
 * Checks whether a workflow step can overwrite a stable artifact on rerun.
 */
function hasArtifactOverwrite(block) {
  return block.some((line) => line.trim() === ARTIFACT_OVERWRITE_DECLARATION);
}

/**
 * Prevents rerun-only CI failures from losing shared artifacts across attempts.
 */
async function validateCiArtifactRerunSafety(rootDirectory, errors) {
  const ciWorkflowPath = resolve(rootDirectory, CI_WORKFLOW_PATH);
  if (!(await pathExists(ciWorkflowPath))) {
    return;
  }
  const ciWorkflow = await readFile(ciWorkflowPath, 'utf8');
  const workflowStepBlocks = collectWorkflowStepBlocks(ciWorkflow);

  for (const artifactPrefix of RERUN_STABLE_CI_ARTIFACT_PREFIXES) {
    const artifactNameLine = `name: ${artifactPrefix}-\${{ github.run_id }}`;

    for (const workflowStepBlock of workflowStepBlocks) {
      const sharedArtifactNameLine = findSharedArtifactNameLine(
        workflowStepBlock,
        artifactPrefix,
      );
      if (
        isUploadArtifactStep(workflowStepBlock) &&
        sharedArtifactNameLine !== undefined &&
        sharedArtifactNameLine.includes(GITHUB_RUN_ATTEMPT_EXPRESSION)
      ) {
        errors.push(
          `${CI_WORKFLOW_PATH} shared CI artifact names must not include ${GITHUB_RUN_ATTEMPT_EXPRESSION}; failed-job reruns need stable ${artifactPrefix} artifact handoffs.`,
        );
      }

      if (
        isUploadArtifactStep(workflowStepBlock) &&
        hasArtifactName(workflowStepBlock, artifactNameLine) &&
        !hasArtifactOverwrite(workflowStepBlock)
      ) {
        errors.push(
          `${CI_WORKFLOW_PATH} shared CI artifact '${artifactPrefix}' must declare ${ARTIFACT_OVERWRITE_DECLARATION} so full workflow reruns can replace stale artifacts.`,
        );
      }
    }
  }
}

async function validateOpenClawToolDocumentation(rootDirectory, errors) {
  let documentedTools;
  let registeredTools;
  try {
    documentedTools = await getDocumentedOpenClawTools(rootDirectory);
    registeredTools = await getRegisteredOpenClawTools(rootDirectory);
  } catch (error) {
    errors.push(normalizeInstructionError(error));
    return;
  }

  for (const toolName of registeredTools) {
    if (!documentedTools.has(toolName)) {
      errors.push(
        `packages/openclaw/README.md is missing documented tool '${toolName}'.`,
      );
    }
  }

  for (const toolName of documentedTools) {
    if (!registeredTools.has(toolName)) {
      errors.push(
        `packages/openclaw/README.md documents unknown tool '${toolName}'.`,
      );
    }
  }

  for (const toolName of REQUIRED_OPENCLAW_TOOLS) {
    if (!registeredTools.has(toolName)) {
      errors.push(
        `packages/openclaw is missing required foundation tool '${toolName}'.`,
      );
    }
  }
}

function buildRequiredTextRules({
  expectedNodeVersion,
  normalizedNodeVersion,
  expectedPackageManager,
  expectedTypeScriptVersion,
}) {
  return [
    {
      path: 'README.md',
      requiredText: [
        `Node.js \`${expectedNodeVersion}\``,
        `\`packageManager\` \`${expectedPackageManager}\``,
        `TypeScript \`${expectedTypeScriptVersion}\` as the authoring baseline`,
        LINUX_COMPATIBILITY_SENTENCE,
        '[`PLATFORM.md`](./PLATFORM.md)',
        '`npm run lint`, included in `check:repo`, verifies authored package JSDoc',
      ],
    },
    {
      path: 'AGENTS.md',
      requiredText: [
        'Use `PLATFORM.md` as the authoritative foundation-scope document for required packages, surfaces, workflows, and acceptance criteria.',
        'Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.',
        'Branch names and pull request titles must not include any registered tool name.',
        'Pull request titles must use conventional commit format.',
        'Pull request bodies must follow `.github/pull_request_template.md` and fill every section with repo-specific content.',
        'Every pull request containing any code change must include a detailed Changesets entry before it is opened or updated; keep that changeset accurate as the branch evolves.',
        'Do not put business logic inside decorators, `@vannadii/devplat-openclaw`, or `@vannadii/devplat-discord`.',
        'Do not colocate domain logic beside OpenClaw or Discord just because those packages initiate the workflow.',
        'Discord interactions must stay thread-aware and bound to the correct spec, slice, or pull request context.',
        'Keep `logic.ts` pure and test it directly.',
        'Keep `service.ts` as the class shell for orchestration, delegation, and side-effect boundaries.',
        'Keep Discord and OpenClaw control-plane contracts aligned with auditable artifacts and generated schemas.',
        "Use structured test tables with `const cases = [...]`. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single `it.each(cases)('$name', ...)` implementation per suite.",
        'The table variable must be named `cases`; alternate table names in `it.each(<name>)` calls are not allowed.',
        'Keep constants in the owning package',
        'Treat regular expressions as constants',
        'Fail closed when a Discord action lacks an unambiguous thread binding.',
      ],
    },
    {
      path: '.github/copilot-instructions.md',
      requiredText: [
        'Use `PLATFORM.md` as the authoritative foundation-scope document for required packages, workflows, delivery surfaces, and acceptance criteria.',
        'Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.',
        'Keep branch names and pull request titles free of registered tool names.',
        'Keep pull request titles in conventional commit form.',
        'Keep pull request bodies aligned with `.github/pull_request_template.md` and populate every section with the actual change details.',
        'Every pull request containing any code change must include a detailed Changesets entry before it is opened or updated; keep that changeset accurate as the branch evolves.',
        'Never place business logic inside decorators, `@vannadii/devplat-openclaw`, or `@vannadii/devplat-discord`.',
        "Use structured `const cases = [...]` test tables. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single `it.each(cases)('$name', ...)` implementation per suite.",
        'The table variable must be named `cases`; alternate table names in `it.each(<name>)` calls are not allowed.',
        'Keep constants in package-local `constants.ts` files.',
        'Treat regular expressions as constants',
        'Do not colocate domain logic next to OpenClaw or Discord entrypoints just because the workflow starts there.',
        'Fail closed when a Discord interaction cannot be resolved to a single bound thread context.',
        'Keep Discord and OpenClaw control-plane contracts aligned with generated schemas, auditable artifacts, and the platform packages that own the behavior.',
      ],
    },
    {
      path: '.github/instructions/architecture.instructions.md',
      requiredText: [
        'Keep business logic in platform packages, with pure `logic.ts` and thin `service.ts` shells.',
        'Do not colocate domain logic with OpenClaw or Discord entrypoints merely because those packages initiate the workflow.',
        'Keep Discord and OpenClaw contracts aligned with artifacts, codecs, and generated schemas owned by platform packages.',
      ],
    },
    {
      path: '.github/instructions/discord.instructions.md',
      requiredText: [
        'All interactions MUST be thread-aware.',
        'Every spec, slice, and pull request interaction must resolve to a dedicated bound thread.',
        'If the thread binding is missing, ambiguous, or stale, fail closed and require rebinding instead of guessing.',
        'Support thread-scoped operator actions for run, approve, retry, merge, rebase dependents, and pause or resume flows.',
        'Discord handlers should normalize control-plane input, delegate immediately into platform services, and emit auditable artifacts.',
        'Do not place domain logic, policy decisions, or contract ownership inside Discord transport or thread-handling code.',
        'Keep thread == unit of work as an auditable invariant.',
        'Keep Discord-facing contracts aligned across TypeScript types, codecs, generated schemas, and artifacts.',
      ],
    },
    {
      path: '.github/instructions/openclaw.instructions.md',
      requiredText: [
        'Use `PLATFORM.md` as the source for the required foundation-phase adapter surface, then keep the implementation guidance here focused on delegation, validation, and auditability.',
        'Keep the minimum adapter surface covering research, specs, slicing, queue state, worktrees, gates, artifact validation, review, remediation, supervisor control, GitHub coordination, and thread-aware Discord control.',
        'Tool handlers must not absorb domain logic merely because the tool entrypoint is already in `packages/openclaw`.',
        'Keep OpenClaw-adjacent domain behavior in platform packages even when OpenClaw is the only current caller.',
        'Fail closed when a privileged or context-sensitive action does not resolve to a single valid platform record.',
        'Keep OpenClaw-facing contracts aligned across TypeScript types, codecs, generated schemas, and auditable artifacts.',
      ],
    },
    {
      path: '.github/instructions/platform.instructions.md',
      requiredText: [
        'Use `PLATFORM.md` as the authoritative completion-scope document for required packages, delivery surfaces, workflows, and acceptance criteria.',
        'Discord and OpenClaw may initiate workflows, but they do not own the underlying business logic or public contracts.',
        'Treat thread-aware Discord control, adapter-only OpenClaw behavior, and auditable lifecycle state as non-negotiable completion properties.',
      ],
    },
    {
      path: 'CONTRIBUTING.md',
      requiredText: [
        `Node.js \`${expectedNodeVersion}\``,
        `\`packageManager\` pinned to \`${expectedPackageManager}\``,
        `Primary authoring targets TypeScript \`${expectedTypeScriptVersion}\`.`,
        LINUX_COMPATIBILITY_SENTENCE,
        'Use [`PLATFORM.md`](./PLATFORM.md) as the authoritative foundation-scope document for required packages, workflows, delivery surfaces, and acceptance criteria.',
        'Keep Discord interactions thread-aware and fail closed when the thread context is missing or ambiguous.',
        'Keep branch names and pull request titles descriptive of intent and never reuse any registered tool name.',
        'Keep pull request titles in conventional commit format.',
        'Every pull request containing any code change must include a detailed Changesets entry before it is opened or updated; keep that changeset accurate as the branch evolves.',
        'Pull request bodies must use `.github/pull_request_template.md` and populate every section rather than replacing it with an ad hoc summary.',
        'naming rules',
        'Pull request titles must also use conventional commit format.',
      ],
    },
    {
      path: '.github/instructions/github.instructions.md',
      requiredText: [
        'Branch names and pull request titles must describe intent, not reuse any registered tool name.',
        'Pull request titles must use conventional commit format.',
        'Pull request bodies must use the repository template at `.github/pull_request_template.md` and fill every section with concrete change data.',
      ],
    },
    {
      path: 'site/guide-docs/guides/architecture.md',
      requiredText: [
        'OpenClaw and Discord may initiate workflows, but they do not own domain logic or public contracts',
        'domain logic stays in platform packages, with pure `logic.ts` units and thin `service.ts` shells',
        'The authoritative foundation scope, package responsibilities, and acceptance criteria live in the root `PLATFORM.md`.',
        'Discord interactions stay thread-aware so thread context remains the unit of work for specs, slices, and pull requests',
      ],
    },
    {
      path: 'site/guide-docs/guides/discord-workflows.md',
      requiredText: [
        '`PLATFORM.md` defines the required operator workflow surface. This guide describes how to keep that surface thread-aware and auditable.',
        'Discord transport and thread code should delegate into platform services rather than own business logic or contract normalization.',
        'fail closed when a command is issued without a valid thread binding',
        'thread == unit of work',
        'keep Discord-facing approval contracts aligned with codecs, generated schemas, and auditable artifacts',
      ],
    },
    {
      path: 'site/guide-docs/guides/openclaw-setup.md',
      requiredText: [
        'Domain logic and public contract ownership stay in platform packages even when OpenClaw is the only current caller.',
        'OpenClaw tool handlers should validate, delegate, and format results rather than accumulate business logic near the entrypoint.',
        '`PLATFORM.md` defines the required foundation-phase tool surface; the adapter must expose that surface without re-owning the behavior.',
      ],
    },
    {
      path: 'site/guide-docs/guides/platform-lifecycle.md',
      requiredText: [
        'Finish docs, compatibility validation, Docker, Helm, and release automation in the phase order defined by `PLATFORM.md`.',
        'foundation work must satisfy the acceptance criteria defined in `PLATFORM.md`',
        'Discord workflows must remain thread-aware and auditable',
      ],
    },
    {
      path: 'site/guide-docs/guides/package-reference.md',
      requiredText: [
        '`@vannadii/devplat-memory`: persistent knowledge, constraints, and history',
        '`@vannadii/devplat-openclaw`: OpenClaw plugin entrypoint and tool registration surface, kept adapter-only',
      ],
    },
    {
      path: 'site/guide-docs/guides/developer-guide.md',
      requiredText: [
        '`npm run check:naming`',
        'keep branch names and pull request titles free of registered tool names',
        'keep pull request titles in conventional commit format',
        'keep pull request bodies aligned with `.github/pull_request_template.md` and fill every section with concrete change details',
        'keep a detailed Changesets entry on every pull request containing code changes, and update it whenever later commits change runtime, operator, package, workflow, or validation impact',
        "keep tests in structured `const cases = [...]` tables where each case provides `inputs`, `mock`, and `assert`, then exercises a single `it.each(cases)('$name', ...)` implementation per suite",
        'alternate `it.each(<name>)` table variables',
        '`npm run lint` enforces this for authored package source',
      ],
    },
    {
      path: '.github/instructions/testing.instructions.md',
      requiredText: [
        "Use structured `const cases = [...]` tables. Each case must declare `inputs`, a `mock` setup function, and an `assert` function, then run through a single `it.each(cases)('$name', ...)` implementation per suite.",
        'The table variable must be named `cases`; alternate table names in `it.each(<name>)` calls are not allowed.',
        'Every named pattern needs matching and non-matching cases',
        'Run `npm run check:changed-coverage` before completing executable source changes.',
      ],
    },
    {
      path: 'site/guide-docs/guides/introduction.md',
      requiredText: [
        `Node \`${normalizedNodeVersion}\``,
        `TypeScript \`${expectedTypeScriptVersion}\``,
        `Primary authoring targets TypeScript \`${expectedTypeScriptVersion}\`.`,
        LINUX_COMPATIBILITY_SENTENCE,
      ],
    },
    {
      path: 'site/guide-docs/guides/configuration-reference.md',
      requiredText: [
        `Node \`${normalizedNodeVersion}\``,
        `\`${expectedPackageManager}\``,
        `TypeScript \`${expectedTypeScriptVersion}\``,
        'Do not use TypeScript type assertions or casts anywhere in authored code; banned forms include `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.',
        LINUX_COMPATIBILITY_SENTENCE,
      ],
    },
    {
      path: '.github/instructions/compatibility.instructions.md',
      requiredText: [
        `Node.js \`${expectedNodeVersion}\``,
        `\`${expectedPackageManager}\``,
        `TypeScript \`${expectedTypeScriptVersion}\``,
        LINUX_COMPATIBILITY_SENTENCE,
      ],
    },
    {
      path: 'PLATFORM.md',
      requiredText: [
        'All interactions MUST be thread-aware.',
        'TypeScript type assertions and casts are banned in authored code, including `as`, `as unknown`, angle-bracket casts, non-null assertions, and double assertions.',
        'thread == unit of work',
        'adapter only, registers all platform tools, no business logic',
      ],
    },
    {
      path: '.github/ISSUE_TEMPLATE/bug-report.yml',
      requiredText: [
        'label: Lifecycle stage',
        'label: Affected release surfaces',
        'label: Operator and audit impact',
        'label: Performance impact',
      ],
    },
    {
      path: '.github/ISSUE_TEMPLATE/feature-request.yml',
      requiredText: [
        'label: Lifecycle stage',
        'label: Affected release surfaces',
        'label: Operator and audit impact',
        'label: Performance expectations',
      ],
    },
    {
      path: '.github/pull_request_template.md',
      requiredText: [
        '### Performance Impact',
        '### Rollback Notes',
        '## Validation Performed',
      ],
    },
    {
      path: 'site/guide-docs/index.md',
      requiredText: [
        '[Live Test Lab](./guides/live-test-lab.md)',
        '[Platform Lifecycle](./guides/platform-lifecycle.md)',
        '[Quality and Performance Policy](./guides/quality-performance-policy.md)',
      ],
    },
  ];
}

function validateDocsNavigation(configText, errors) {
  const requiredLinks = [
    '/guides/live-test-cleanup-and-concurrency',
    '/guides/live-test-discord-setup',
    '/guides/live-test-github-setup',
    '/guides/live-test-lab',
    '/guides/live-test-sonar-setup',
    '/guides/platform-lifecycle',
    '/guides/quality-performance-policy',
    '/guides/package-reference',
    '/guides/examples',
    '/guides/docker-usage',
    '/guides/helm-k3s-deployment',
    '/guides/sonarcloud-integration',
  ];

  for (const link of requiredLinks) {
    const minimumOccurrences =
      link === '/guides/live-test-lab' ||
      link === '/guides/platform-lifecycle' ||
      link === '/guides/quality-performance-policy'
        ? 2
        : 1;

    if (countOccurrences(configText, link) < minimumOccurrences) {
      errors.push(
        minimumOccurrences === 2
          ? `site/guide-docs/.vitepress/config.mts must reference '${link}' in both nav and sidebar.`
          : `site/guide-docs/.vitepress/config.mts must reference '${link}' in the guide navigation.`,
      );
    }
  }
}

function validatePlatformScope(fileContents, errors) {
  const platformSpec = fileContents.get('PLATFORM.md');
  if (platformSpec === undefined) {
    return;
  }

  for (const packageName of REQUIRED_PLATFORM_PACKAGES) {
    if (!platformSpec.includes(`\`${packageName}\``)) {
      errors.push(`PLATFORM.md is missing required package '${packageName}'.`);
    }
  }
}

async function getDocumentedOpenClawTools(rootDirectory) {
  const readme = await readFile(
    resolve(rootDirectory, 'packages/openclaw/README.md'),
    'utf8',
  );
  const toolSectionMatch = readme.match(OPENCLAW_README_TOOL_SECTION_PATTERN);
  if (toolSectionMatch === null) {
    throw new Error(
      'packages/openclaw/README.md is missing the Exposed Tools section.',
    );
  }

  const tools = new Set();

  for (const match of toolSectionMatch[1].matchAll(
    OPENCLAW_README_TOOL_LINE_PATTERN,
  )) {
    tools.add(match[1]);
  }

  return tools;
}

export async function getRegisteredOpenClawTools(rootDirectory) {
  const indexText = await readFile(
    resolve(rootDirectory, 'packages/openclaw/src/index.ts'),
    'utf8',
  );
  const serviceText = await readFile(
    resolve(rootDirectory, 'packages/openclaw/src/tool-surfaces/service.ts'),
    'utf8',
  );
  const constantsText = await readFile(
    resolve(rootDirectory, 'packages/openclaw/src/tool-surfaces/constants.ts'),
    'utf8',
  );

  const registeredFactories = getOpenClawRegisteredFactories({
    indexText,
    serviceText,
  });

  const factoryToToolName = new Map([
    ...[
      ...serviceText.matchAll(OPENCLAW_FACTORY_LITERAL_TOOL_NAME_PATTERN),
    ].map((match) => [match[1], match[2]]),
    ...resolveOpenClawConstantToolNames({ constantsText, serviceText }),
  ]);

  const tools = new Set();
  for (const factoryName of registeredFactories) {
    const toolName = factoryToToolName.get(factoryName);
    if (toolName === undefined) {
      throw new Error(
        `Could not resolve OpenClaw tool name for factory ${factoryName}.`,
      );
    }

    tools.add(toolName);
  }

  return tools;
}

/**
 * Resolves factory tool names that are backed by package-owned constants.
 */
function resolveOpenClawConstantToolNames({ constantsText, serviceText }) {
  const stringConstants = new Map(
    [...constantsText.matchAll(OPENCLAW_STRING_CONSTANT_PATTERN)].map(
      (match) => [match[1], match[2]],
    ),
  );

  return [
    ...serviceText.matchAll(OPENCLAW_FACTORY_CONSTANT_TOOL_NAME_PATTERN),
  ].map((match) => {
    const resolvedToolName = stringConstants.get(match[2]);
    if (resolvedToolName === undefined) {
      throw new Error(
        `Could not resolve OpenClaw tool name constant ${match[2]} for factory ${match[1]}.`,
      );
    }

    return [match[1], resolvedToolName];
  });
}

/**
 * Resolves OpenClaw tool factory names from the plugin entrypoint.
 */
function getOpenClawRegisteredFactories({ indexText, serviceText }) {
  const factories = [
    ...indexText.matchAll(OPENCLAW_DIRECT_REGISTRATION_PATTERN),
  ].map((match) => match[1]);

  if (OPENCLAW_TOOL_INVENTORY_CALL_PATTERN.test(indexText)) {
    factories.push(...getOpenClawInventoryFactories(serviceText));
  }

  return [...new Set(factories)];
}

/**
 * Resolves OpenClaw tool factory names from the centralized inventory.
 */
function getOpenClawInventoryFactories(serviceText) {
  const inventoryMatch = serviceText.match(
    OPENCLAW_TOOL_INVENTORY_BODY_PATTERN,
  );
  if (inventoryMatch === null) {
    throw new Error(
      'packages/openclaw/src/tool-surfaces/service.ts is missing createDevplatOpenClawTools inventory.',
    );
  }

  return [
    ...inventoryMatch[1].matchAll(OPENCLAW_INVENTORY_FACTORY_PATTERN),
  ].map((match) => match[1]);
}

/**
 * Converts unknown checker errors into reportable instruction drift text.
 */
function normalizeInstructionError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function pathExists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function hasExactLine(content, line) {
  return new RegExp(`^${escapeRegExp(line)}$`, 'mu').test(content);
}

function countOccurrences(content, needle) {
  return content.split(needle).length - 1;
}

function escapeRegExp(value) {
  return value.replace(REGEXP_SPECIAL_CHARACTERS_PATTERN, '\\$&');
}

async function main() {
  const errors = await collectInstructionErrors();

  if (errors.length > 0) {
    throw new Error(`Instruction drift detected:\n${errors.join('\n')}`);
  }

  console.log(
    `Validated ${String(REQUIRED_INSTRUCTION_FILES.length)} instruction surfaces.`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

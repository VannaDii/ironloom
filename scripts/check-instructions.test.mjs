import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  collectInstructionErrors,
  getRegisteredOpenClawTools,
  REQUIRED_INSTRUCTION_FILES,
  REQUIRED_WORKFLOW_FILES,
} from './check-instructions.mjs';

const repoRootDirectory = resolve(import.meta.dirname, '..');
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((rootDirectory) =>
        rm(rootDirectory, { force: true, recursive: true }),
      ),
  );
});

describe('check-instructions', () => {
  const cases = [
    {
      name: 'passes on the repository instruction surfaces',
      inputs: {
        useFixtureRoot: false,
      },
      mock: async () => undefined,
      assert: (errors) => {
        expect(errors).toEqual([]);
      },
    },
    {
      name: 'fails when a version statement drifts',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'README.md',
          'Node.js `v24.14.1`',
          'Node.js `v24.0.0`',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('README.md') &&
              error.includes('Node.js `v24.14.1`'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when a required heading is missing',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'CONTRIBUTING.md',
          '## Merge Readiness',
          '## Readiness',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('CONTRIBUTING.md') &&
              error.includes('## Merge Readiness'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when the code-change changeset rule drifts',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'CONTRIBUTING.md',
          'Every pull request containing any code change must include a detailed Changesets entry before it is opened or updated; keep that changeset accurate as the branch evolves.',
          'Add a changeset for release-facing behavior changes.',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('CONTRIBUTING.md') &&
              error.includes('Every pull request containing any code change'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when the canonical case table variable rule drifts',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          '.github/instructions/testing.instructions.md',
          'The table variable must be named `cases`; alternate table names in `it.each(<name>)` calls are not allowed.',
          'Prefer obvious table names.',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('.github/instructions/testing.instructions.md') &&
              error.includes('The table variable must be named `cases`'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when the JSDoc governance command drifts from developer docs',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'site/guide-docs/guides/developer-guide.md',
          '; `npm run check:jsdoc` enforces this for authored package source',
          '',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('site/guide-docs/guides/developer-guide.md') &&
              error.includes('`npm run check:jsdoc`'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when docs navigation omits a first-class guide',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'site/guide-docs/.vitepress/config.mts',
          "{ text: 'Lifecycle', link: '/guides/platform-lifecycle' },\n",
          '',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('site/guide-docs/.vitepress/config.mts') &&
              error.includes('/guides/platform-lifecycle'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when a required workflow surface is missing',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await rm(
          resolve(rootDirectory, '.github/workflows/typescript-matrix.yml'),
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('.github/workflows/typescript-matrix.yml') &&
              error.includes('Missing required workflow surface'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when shared CI artifact names depend on run attempts',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          '.github/workflows/ci.yml',
          'name: schemas-${{ github.run_id }}',
          'name: schemas-${{ github.run_id }}-${{ github.run_attempt }}',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('.github/workflows/ci.yml') &&
              error.includes('shared CI artifact names') &&
              error.includes('github.run_attempt'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when shared CI artifact names include run attempts before the run id',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          '.github/workflows/ci.yml',
          'name: schemas-${{ github.run_id }}',
          'name: schemas-${{ github.run_attempt }}-${{ github.run_id }}',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('.github/workflows/ci.yml') &&
              error.includes('shared CI artifact names') &&
              error.includes('github.run_attempt'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when shared CI artifact uploads cannot overwrite rerun artifacts',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          '.github/workflows/ci.yml',
          '          overwrite: true\n          path: |\n            packages/*/schemas/*.schema.json',
          '          path: |\n            packages/*/schemas/*.schema.json',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('.github/workflows/ci.yml') &&
              error.includes("shared CI artifact 'schemas'") &&
              error.includes('overwrite: true'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'allows shared CI artifact upload metadata to be reordered',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          '.github/workflows/ci.yml',
          '          retention-days: 14\n          overwrite: true\n          path: |\n            packages/*/schemas/*.schema.json',
          '          overwrite: true\n          retention-days: 7\n          path: |\n            packages/*/schemas/*.schema.json',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('.github/workflows/ci.yml') &&
              error.includes("shared CI artifact 'schemas'") &&
              error.includes('overwrite: true'),
          ),
        ).toBe(false);
      },
    },
    {
      name: 'fails when the platform scope drifts away from thread-aware Discord control',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'PLATFORM.md',
          'All interactions MUST be thread-aware.',
          'Interactions should be thread-aware.',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('PLATFORM.md') &&
              error.includes('All interactions MUST be thread-aware.'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when OpenClaw tool documentation drifts',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'packages/openclaw/README.md',
          '- `run_supervisor_step`: run a supervisor orchestration step\n',
          '',
        );
      },
      assert: (errors) => {
        expect(
          errors.some(
            (error) =>
              error.includes('packages/openclaw/README.md') &&
              error.includes('run_supervisor_step'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when the centralized OpenClaw inventory references an unknown factory',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'packages/openclaw/src/tool-surfaces/service.ts',
          '    createRunSupervisorStepTool(),',
          '    createMissingTool(),',
        );
      },
      assert: (errors) => {
        expect(
          errors.some((error) => error.includes('createMissingTool')),
        ).toBe(true);
      },
    },
    {
      name: 'resolves constant-backed OpenClaw tool names from constants file',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'packages/openclaw/src/tool-surfaces/service.ts',
          "    name: 'list_stored_records',",
          '    name: LIST_STORED_RECORDS_TOOL_NAME,',
        );
        await appendToFile(
          rootDirectory,
          'packages/openclaw/src/tool-surfaces/constants.ts',
          [
            '',
            '/**',
            ' * Tool name for listing storage records through the adapter.',
            ' */',
            "export const LIST_STORED_RECORDS_TOOL_NAME = 'list_stored_records';",
            '',
          ].join('\n'),
        );
      },
      assert: async (_errors, { rootDirectory }) => {
        await expect(
          getRegisteredOpenClawTools(rootDirectory),
        ).resolves.toContain('list_stored_records');
      },
    },
    {
      name: 'fails when an OpenClaw tool name constant is missing',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'packages/openclaw/src/tool-surfaces/service.ts',
          '    name: LIST_STORED_INDEX_TOOL_NAME,',
          '    name: MISSING_OPENCLAW_TOOL_NAME,',
        );
      },
      assert: (errors) => {
        expect(
          errors.some((error) => error.includes('MISSING_OPENCLAW_TOOL_NAME')),
        ).toBe(true);
      },
    },
    {
      name: 'fails when the centralized OpenClaw inventory is missing',
      inputs: {
        useFixtureRoot: true,
      },
      mock: async ({ rootDirectory }) => {
        await replaceInFile(
          rootDirectory,
          'packages/openclaw/src/tool-surfaces/service.ts',
          'export function createDevplatOpenClawTools(): AnyAgentTool[] {',
          'export function createDevplatToolInventory(): AnyAgentTool[] {',
        );
      },
      assert: (errors) => {
        expect(
          errors.some((error) =>
            error.includes('missing createDevplatOpenClawTools inventory'),
          ),
        ).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const rootDirectory = testCase.inputs.useFixtureRoot
      ? await createFixtureRoot()
      : repoRootDirectory;

    await testCase.mock({ ...testCase.inputs, rootDirectory });
    const outcome = await collectInstructionErrors({ rootDirectory });
    await testCase.assert(outcome, { rootDirectory });
  });
});

async function createFixtureRoot() {
  const rootDirectory = await mkdtemp(
    resolve(tmpdir(), 'devplat-check-instructions-'),
  );
  temporaryRoots.push(rootDirectory);

  for (const relativePath of [
    ...REQUIRED_INSTRUCTION_FILES,
    ...REQUIRED_WORKFLOW_FILES,
    'package.json',
    '.nvmrc',
  ]) {
    const targetPath = resolve(rootDirectory, relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await cp(resolve(repoRootDirectory, relativePath), targetPath);
  }

  return rootDirectory;
}

async function replaceInFile(
  rootDirectory,
  relativePath,
  originalText,
  nextText,
) {
  const filePath = resolve(rootDirectory, relativePath);
  const source = await readFile(filePath, 'utf8');
  const updated = source.replace(originalText, nextText);
  if (source === updated) {
    throw new Error(`Could not replace text in ${relativePath}.`);
  }

  await writeFile(filePath, updated, 'utf8');
}

async function appendToFile(rootDirectory, relativePath, text) {
  const filePath = resolve(rootDirectory, relativePath);
  const source = await readFile(filePath, 'utf8');

  await writeFile(filePath, `${source}${text}`, 'utf8');
}

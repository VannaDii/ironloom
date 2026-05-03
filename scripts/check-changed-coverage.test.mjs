import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectChangedCoverageErrors,
  isExecutableSourceFile,
  readCoverageText,
} from './check-changed-coverage.mjs';

/**
 * Delay that reproduces LCOV report materialization after a coverage process exits.
 */
const delayedCoverageWriteDelayMs = 20;

describe('check-changed-coverage', () => {
  const cases = [
    {
      name: 'passes when changed executable files have full coverage',
      inputs: {
        mode: 'coverage',
        changedFiles: ['packages/openclaw/src/index.ts'],
        coverageText: [
          'TN:',
          'SF:/repo/packages/openclaw/src/index.ts',
          'DA:1,1',
          'DA:2,1',
          'FNDA:1,validatePluginConfig',
          'BRDA:1,0,0,1',
          'end_of_record',
        ].join('\n'),
      },
      mock: async () => undefined,
      assert: (outcome) => {
        expect(outcome).toEqual([]);
      },
    },
    {
      name: 'fails when changed executable files are missing coverage data',
      inputs: {
        mode: 'coverage',
        changedFiles: ['packages/openclaw/src/index.ts'],
        coverageText: '',
      },
      mock: async () => undefined,
      assert: (outcome) => {
        expect(
          outcome.some((error) =>
            error.includes('packages/openclaw/src/index.ts'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'fails when changed executable files have partial line coverage',
      inputs: {
        mode: 'coverage',
        changedFiles: ['packages/openclaw/src/index.ts'],
        coverageText: [
          'TN:',
          'SF:/repo/packages/openclaw/src/index.ts',
          'DA:1,1',
          'DA:2,0',
          'FNDA:1,validatePluginConfig',
          'BRDA:1,0,0,1',
          'end_of_record',
        ].join('\n'),
      },
      mock: async () => undefined,
      assert: (outcome) => {
        expect(
          outcome.some((error) => error.includes('100% line coverage')),
        ).toBe(true);
      },
    },
    {
      name: 'ignores non-executable source files',
      inputs: {
        mode: 'coverage',
        changedFiles: [
          'packages/openclaw/src/tool-surfaces/types.ts',
          'packages/openclaw/src/tool-surfaces/service.test.ts',
        ],
        coverageText: '',
      },
      mock: async () => undefined,
      assert: (outcome) => {
        expect(outcome).toEqual([]);
      },
    },
    {
      name: 'accepts executable source files',
      inputs: {
        mode: 'executable',
        filePath: 'packages/openclaw/src/index.ts',
      },
      mock: async () => undefined,
      assert: (outcome) => {
        expect(outcome).toBe(true);
      },
    },
    {
      name: 'rejects type-only source files',
      inputs: {
        mode: 'executable',
        filePath: 'packages/openclaw/src/tool-surfaces/types.ts',
      },
      mock: async () => undefined,
      assert: (outcome) => {
        expect(outcome).toBe(false);
      },
    },
    {
      name: 'waits for delayed coverage reports',
      inputs: {
        mode: 'coverage-read',
        coverageText: [
          'TN:',
          'SF:/repo/packages/openclaw/src/index.ts',
          'DA:1,1',
          'end_of_record',
        ].join('\n'),
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(
          join(tmpdir(), 'devplat-coverage-'),
        );
        const coverageDirectory = join(rootDirectory, 'coverage');
        const coverageFile = join(coverageDirectory, 'lcov.info');
        setTimeout(() => {
          mkdir(coverageDirectory, { recursive: true })
            .then(() => writeFile(coverageFile, inputs.coverageText))
            .catch(() => undefined);
        }, delayedCoverageWriteDelayMs);

        return {
          cleanup: () => rm(rootDirectory, { force: true, recursive: true }),
          rootDirectory,
        };
      },
      assert: (outcome, inputs) => {
        expect(outcome).toBe(inputs.coverageText);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock(testCase.inputs);

    try {
      let outcome;
      switch (testCase.inputs.mode) {
        case 'coverage':
          outcome = await collectChangedCoverageErrors({
            rootDirectory: '/repo',
            changedFiles: testCase.inputs.changedFiles,
            coverageText: testCase.inputs.coverageText,
          });
          break;
        case 'coverage-read':
          outcome = await readCoverageText(context.rootDirectory);
          break;
        case 'executable':
          outcome = isExecutableSourceFile(testCase.inputs.filePath);
          break;
        default:
          throw new Error('unsupported check-changed-coverage test mode');
      }

      testCase.assert(outcome, testCase.inputs);
    } finally {
      await context?.cleanup?.();
    }
  });
});

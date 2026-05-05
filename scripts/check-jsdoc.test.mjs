import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectJSDocGovernanceFailures } from './check-jsdoc.mjs';

describe('check-jsdoc', () => {
  const cases = [
    {
      name: 'passes authored declarations with JSDoc',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: [
              '/** Explains the exported value. */',
              'export const exampleValue = 1;',
              '',
              '/** Creates an example value. */',
              'export function createExampleValue(): number {',
              '  return exampleValue;',
              '}',
              '',
              '/** Service used by the example package. */',
              'export class ExampleService {',
              '  /** Returns the example value. */',
              '  public execute(): number {',
              '    return createExampleValue();',
              '  }',
              '}',
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-jsdoc-'));

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        expect(
          await collectJSDocGovernanceFailures({
            rootDirectory: context.rootDirectory,
          }),
        ).toEqual([]);
      },
    },
    {
      name: 'reports authored declarations without JSDoc',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: [
              'export const exampleValue = 1;',
              '',
              'export function createExampleValue(): number {',
              '  return exampleValue;',
              '}',
              '',
              'export class ExampleService {',
              '  public execute(): number {',
              '    return createExampleValue();',
              '  }',
              '}',
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-jsdoc-'));

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        const failures = await collectJSDocGovernanceFailures({
          rootDirectory: context.rootDirectory,
        });

        expect(failures).toContain(
          'packages/example/src/unit/logic.ts:1:1 exampleValue is missing JSDoc.',
        );
        expect(failures).toContain(
          'packages/example/src/unit/logic.ts:3:1 createExampleValue is missing JSDoc.',
        );
        expect(failures).toContain(
          'packages/example/src/unit/logic.ts:7:1 ExampleService is missing JSDoc.',
        );
        expect(failures).toContain(
          'packages/example/src/unit/logic.ts:8:3 execute is missing JSDoc.',
        );
      },
    },
    {
      name: 'reports low-quality generated JSDoc wording',
      inputs: {
        files: [
          {
            path: 'packages/example/src/unit/service.ts',
            contents: [
              '/** Example service service. */',
              'export class ExampleService {',
              '  /** Creates create. */',
              '  public create(): number {',
              '    return 1;',
              '  }',
              '}',
            ].join('\n'),
          },
          {
            path: 'packages/example/src/unit/logic.ts',
            contents: [
              '/** Codec for exec file async. */',
              'export const execFileAsync = () => undefined;',
            ].join('\n'),
          },
        ],
      },
      mock: async (inputs) => {
        const rootDirectory = await mkdtemp(join(tmpdir(), 'devplat-jsdoc-'));

        for (const file of inputs.files) {
          const filePath = resolve(rootDirectory, file.path);
          await mkdir(resolve(filePath, '..'), { recursive: true });
          await writeFile(filePath, file.contents, 'utf8');
        }

        return { rootDirectory };
      },
      assert: async (context) => {
        const failures = await collectJSDocGovernanceFailures({
          rootDirectory: context.rootDirectory,
        });

        expect(failures).toContain(
          "packages/example/src/unit/service.ts:1:1 ExampleService has low-quality JSDoc 'service service'; remove duplicated service wording.",
        );
        expect(failures).toContain(
          "packages/example/src/unit/service.ts:3:3 create has low-quality JSDoc 'Creates create.'; replace placeholder create wording with a concrete summary.",
        );
        expect(failures).toContain(
          "packages/example/src/unit/logic.ts:1:1 execFileAsync has low-quality JSDoc 'Codec for exec file async.'; describe the helper instead of calling it a codec.",
        );
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock(testCase.inputs);

    await testCase.assert(context, testCase.inputs);
  });
});

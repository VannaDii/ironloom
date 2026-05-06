import { describe, expect, it } from 'vitest';

import { createPrePushPlan } from './check-pre-push.mjs';

describe('check-pre-push', () => {
  const cases = [
    {
      name: 'requires repo checks and changed-file SonarQube analysis before build and docs',
      inputs: {},
      mock: async () => undefined,
      assert: async () => {
        const plan = createPrePushPlan();

        expect(plan.map((step) => step.mode)).toEqual([
          'serial',
          'serial',
          'serial',
          'serial',
          'serial',
          'serial',
          'concurrent',
        ]);
        expect(plan[2]).toEqual({
          mode: 'serial',
          label: 'check:repo',
          command: 'npm',
          args: ['run', 'check:repo'],
        });
        expect(plan[5]).toEqual({
          mode: 'serial',
          label: 'sonar:analyze:changed',
          command: 'npm',
          args: ['run', 'sonar:analyze:changed'],
        });
        expect(plan[6].commands.map((command) => command.label)).toEqual([
          'build:workspace',
          'docs:build',
        ]);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    expect.hasAssertions();
    const context = await testCase.mock(testCase.inputs);

    await testCase.assert(context, testCase.inputs);
  });
});

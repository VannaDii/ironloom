import { describe, expect, it } from 'vitest';

import {
  BRANCH_CONFLICT_NEXT_ACTION_RESOLVE_CONFLICTS,
  BRANCH_CONFLICT_NEXT_ACTION_RUN_REBASE_PREVIEW,
} from './constants.js';

describe('rebase dependents constants', () => {
  const cases = [
    {
      name: 'exports branch-conflict next-action constants',
      inputs: {},
      mock: () => ({}),
      assert: () => {
        expect(BRANCH_CONFLICT_NEXT_ACTION_RESOLVE_CONFLICTS).toBe(
          'resolve-conflicts',
        );
        expect(BRANCH_CONFLICT_NEXT_ACTION_RUN_REBASE_PREVIEW).toBe(
          'run-rebase-preview',
        );
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});

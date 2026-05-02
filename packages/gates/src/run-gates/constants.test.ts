import { describe, expect, it } from 'vitest';

import {
  GATE_NEXT_ACTION_CONTINUE,
  GATE_NEXT_ACTION_CREATE_REMEDIATION_PLAN,
  GATE_NEXT_ACTION_REMEDIATE_FAILURE,
} from './constants.js';

describe('run gates constants', () => {
  const cases = [
    {
      name: 'exports gate next-action constants',
      inputs: {},
      mock: () => ({}),
      assert: () => {
        expect(GATE_NEXT_ACTION_CONTINUE).toBe('continue');
        expect(GATE_NEXT_ACTION_REMEDIATE_FAILURE).toBe('remediate-failure');
        expect(GATE_NEXT_ACTION_CREATE_REMEDIATION_PLAN).toBe(
          'create-remediation-plan',
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

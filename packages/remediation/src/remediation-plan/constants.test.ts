import { describe, expect, it } from 'vitest';

import {
  REMEDIATION_NEXT_ACTION_APPLY_REMEDIATION,
  REMEDIATION_NEXT_ACTION_REQUEST_APPROVAL,
} from './constants.js';

describe('remediation plan constants', () => {
  const cases = [
    {
      name: 'exports remediation next-action constants',
      inputs: {},
      mock: () => ({}),
      assert: () => {
        expect(REMEDIATION_NEXT_ACTION_APPLY_REMEDIATION).toBe(
          'apply-remediation',
        );
        expect(REMEDIATION_NEXT_ACTION_REQUEST_APPROVAL).toBe(
          'request-approval',
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

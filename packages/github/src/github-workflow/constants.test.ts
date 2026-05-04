import { describe, expect, it } from 'vitest';

import {
  GITHUB_WORKFLOW_TELEMETRY_ID_PREFIX,
  GITHUB_WORKFLOW_TELEMETRY_SCOPE,
  GITHUB_WORKFLOW_TELEMETRY_TRACE,
} from './constants.js';

describe('github workflow constants', () => {
  const cases = [
    {
      name: 'exports telemetry constants for GitHub workflow audit records',
      inputs: {},
      mock: () => ({}),
      assert: () => {
        expect(GITHUB_WORKFLOW_TELEMETRY_ID_PREFIX).toBe('telemetry');
        expect(GITHUB_WORKFLOW_TELEMETRY_SCOPE).toBe('github');
        expect(GITHUB_WORKFLOW_TELEMETRY_TRACE).toBe('github:workflow');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();
    testCase.assert(context, testCase.inputs);
  });
});

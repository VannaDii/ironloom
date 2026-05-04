import { describe, expect, it } from 'vitest';

import { decodeWithCodec } from '@vannadii/devplat-core';

import { PolicyActionEvaluationCodec, PolicyDecisionCodec } from './codec.js';
import { POLICY_ACTION_CATEGORY_MERGE } from './constants.js';

describe('decision policy codecs', () => {
  const cases = [
    {
      name: 'decode valid policy lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: PolicyDecisionCodec,
            value: {
              id: 'policy-1',
              summary: 'Merge allowed.',
              status: 'approved',
              trace: ['policy evaluated'],
              updatedAt: '2026-04-04T00:00:00.000Z',
              action: 'merge',
              allowed: true,
              requiresApproval: false,
              auditRequired: true,
              privilegeLevel: 'human-approval',
              reason: 'Approved by policy.',
            },
          },
          {
            codec: PolicyActionEvaluationCodec,
            value: {
              id: 'policy-eval-1',
              action: 'merge',
              actionCategory: POLICY_ACTION_CATEGORY_MERGE,
              privileged: true,
              allowed: true,
              requiresApproval: false,
              auditRequired: true,
              privilegeLevel: 'human-approval',
              riskLevel: 'high',
              escalationRequired: false,
              escalationTarget: 'none',
              reason: 'Approved by policy.',
              auditReason: 'Merge policy evaluated.',
              nextAction: 'merge',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => decoded.ok)).toBe(true);
      },
    },
    {
      name: 'reject invalid policy lifecycle timestamps',
      inputs: {
        decoders: [
          {
            codec: PolicyDecisionCodec,
            value: {
              id: 'policy-1',
              summary: 'Merge allowed.',
              status: 'approved',
              trace: ['policy evaluated'],
              updatedAt: '2026-04-04',
              action: 'merge',
              allowed: true,
              requiresApproval: false,
              auditRequired: true,
              privilegeLevel: 'human-approval',
              reason: 'Approved by policy.',
            },
          },
          {
            codec: PolicyActionEvaluationCodec,
            value: {
              id: 'policy-eval-1',
              action: 'merge',
              actionCategory: POLICY_ACTION_CATEGORY_MERGE,
              privileged: true,
              allowed: true,
              requiresApproval: false,
              auditRequired: true,
              privilegeLevel: 'human-approval',
              riskLevel: 'high',
              escalationRequired: false,
              escalationTarget: 'none',
              reason: 'Approved by policy.',
              auditReason: 'Merge policy evaluated.',
              nextAction: 'merge',
              updatedAt: 'April 4, 2026',
            },
          },
        ],
      },
      mock: async ({ decoders }) =>
        decoders.map(({ codec, value }) => decodeWithCodec(codec, value)),
      assert: (decodedValues) => {
        expect(decodedValues.every((decoded) => !decoded.ok)).toBe(true);
      },
    },
  ];

  it.each(cases)('$name', async (testCase) => {
    const outcome = await testCase.mock(testCase.inputs);
    testCase.assert(outcome);
  });
});

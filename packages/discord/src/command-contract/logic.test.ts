import { describe, expect, it } from 'vitest';

import {
  createDiscordApplicationCommandPayloads,
  createDiscordCommandContractRegistry,
  resolveDiscordCommandAction,
} from './logic.js';

type DiscordCommandContractLogicInputs =
  | {
      mode: 'registry';
      expectedNames: readonly string[];
    }
  | {
      mode: 'resolve';
      commandName: string;
      expectedAction: string | undefined;
    };

type DiscordCommandContractLogicCase = {
  name: string;
  inputs: DiscordCommandContractLogicInputs;
  mock: () => Record<string, never>;
  assert: (
    context: Record<string, never>,
    inputs: DiscordCommandContractLogicInputs,
  ) => void;
};

describe('Discord command contract logic', () => {
  const cases = [
    {
      name: 'publishes the real operator command set for guild registration',
      inputs: {
        mode: 'registry',
        expectedNames: [
          'new-project',
          'open-project',
          'project-summary',
          'project-settings',
          'project-settings-history',
          'cancel-project',
          'resume-project',
          'release-project',
          'phase-contract',
          'alternatives',
          'alts',
          'redirect',
          'consider',
          'research',
          'spec',
          'run-this',
          'claim-this',
          'approve-this',
          'block-this',
          'complete-this',
          'pause-this',
          'resume-this',
          'retry-gates',
          'merge-now',
          'rebase-dependents',
          'sync-worktree',
          'release-worktree',
          'show-status',
          'show-last-artifact',
          'explain-failure',
          'update-spec',
        ],
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'registry') {
          throw new Error('expected registry inputs');
        }

        const registry = createDiscordCommandContractRegistry();
        const payloads = createDiscordApplicationCommandPayloads();

        expect(registry.version).toBe(1);
        expect(registry.contracts.map((contract) => contract.name)).toEqual(
          inputs.expectedNames,
        );
        expect(payloads).toEqual(
          registry.contracts.map((contract) => ({
            name: contract.name,
            description: contract.description,
            type: contract.type,
          })),
        );
        expect(
          registry.contracts
            .filter((contract) => contract.privileged)
            .map((contract) => contract.action),
        ).toEqual([
          'new-project',
          'open-project',
          'project-settings',
          'cancel-project',
          'resume-project',
          'release-project',
          'approve-this',
          'merge-now',
          'rebase-all-dependents',
          'release-worktree',
        ]);
      },
    },
    {
      name: 'maps public rebase command names to the lifecycle action',
      inputs: {
        mode: 'resolve',
        commandName: 'rebase-dependents',
        expectedAction: 'rebase-all-dependents',
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'resolve') {
          throw new Error('expected resolve inputs');
        }

        expect(resolveDiscordCommandAction(inputs.commandName)).toBe(
          inputs.expectedAction,
        );
      },
    },
    {
      name: 'returns undefined for commands outside the operator contract',
      inputs: {
        mode: 'resolve',
        commandName: 'deploy-now',
        expectedAction: undefined,
      },
      mock: () => ({}),
      assert: (context, inputs) => {
        if (inputs.mode !== 'resolve') {
          throw new Error('expected resolve inputs');
        }

        expect(resolveDiscordCommandAction(inputs.commandName)).toBe(
          inputs.expectedAction,
        );
      },
    },
  ] satisfies DiscordCommandContractLogicCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});

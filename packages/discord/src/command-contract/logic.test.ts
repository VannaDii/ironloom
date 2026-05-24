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
        for (const name of registry.contracts.map(
          (contract) => contract.name,
        )) {
          expect(name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        }
        expect(payloads).toEqual(
          registry.contracts.map((contract) => ({
            name: contract.name,
            description: contract.description,
            type: contract.type,
            ...(contract.options === undefined
              ? {}
              : { options: contract.options }),
          })),
        );
        expect(
          payloads.find((payload) => payload.name === 'new-project'),
        ).toEqual({
          name: 'new-project',
          description:
            'Bootstrap a project from Discord-only operator controls.',
          type: 1,
          options: [
            {
              type: 3,
              name: 'repo',
              description: 'Repository name to bootstrap or create.',
              required: true,
              choices: [],
            },
            {
              type: 3,
              name: 'project',
              description:
                'Unique project name (3-30 characters) within the repository.',
              required: true,
              choices: [],
            },
            {
              type: 3,
              name: 'quality-strictness',
              description:
                'Enable strict standards enforcement for this project run.',
              required: false,
              choices: [
                { name: 'on', value: 'on' },
                { name: 'off', value: 'off' },
              ],
            },
          ],
        });
        expect(
          payloads.find((payload) => payload.name === 'open-project'),
        ).toEqual({
          name: 'open-project',
          description:
            'Open a project dashboard and route commands by context.',
          type: 1,
          options: [
            {
              type: 3,
              name: 'repo',
              description: 'Repository name that owns the project.',
              required: true,
              choices: [],
            },
            {
              type: 3,
              name: 'project',
              description:
                'Project name bound to the operator control context.',
              required: true,
              choices: [],
            },
            {
              type: 3,
              name: 'intent',
              description:
                'Execution intent for immutable open-project run context.',
              required: true,
              choices: [
                { name: 'maintenance', value: 'maintenance' },
                { name: 'bugfix', value: 'bugfix' },
                { name: 'new-feature', value: 'new-feature' },
              ],
            },
          ],
        });
        expect(
          payloads.find((payload) => payload.name === 'resume-project'),
        ).toEqual({
          name: 'resume-project',
          description:
            'Run project preflight checks and resume paused project work.',
          type: 1,
          options: [
            {
              type: 3,
              name: 'force',
              description:
                'Bypass resume preflight confirmation and force project resume.',
              required: false,
              choices: [{ name: 'force', value: 'force' }],
            },
          ],
        });
        expect(
          payloads.find(
            (payload) => payload.name === 'project-settings-history',
          ),
        ).toEqual({
          name: 'project-settings-history',
          description:
            'Show append-only settings history for the active project.',
          type: 1,
          options: [
            {
              type: 3,
              name: 'mode',
              description:
                'History visibility mode: summary for everyone, detailed for project operators.',
              required: false,
              choices: [
                { name: 'summary', value: 'summary' },
                { name: 'detailed', value: 'detailed' },
              ],
            },
          ],
        });
        expect(payloads.find((payload) => payload.name === 'redirect')).toEqual(
          {
            name: 'redirect',
            description:
              'Replace discovery direction for the next research updates.',
            type: 1,
            options: [
              {
                type: 3,
                name: 'direction-prompt',
                description:
                  'Replacement direction for the next research cycle.',
                required: true,
                choices: [],
              },
            ],
          },
        );
        expect(payloads.find((payload) => payload.name === 'consider')).toEqual(
          {
            name: 'consider',
            description: 'Queue a URL for the next research update.',
            type: 1,
            options: [
              {
                type: 3,
                name: 'url',
                description:
                  'URL queued for inclusion in the next research update.',
                required: true,
                choices: [],
              },
            ],
          },
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

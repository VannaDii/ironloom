import type { DiscordControlAction } from '../discord-control-plane/types.js';
import type {
  DiscordApplicationCommandType,
  DiscordCommandContract,
  DiscordCommandContractRegistry,
} from './types.js';

const applicationCommandType: DiscordApplicationCommandType = 1;

const commandContracts: readonly DiscordCommandContract[] = [
  {
    name: 'run-this',
    description: 'Run the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'run-this',
    privileged: false,
  },
  {
    name: 'claim-this',
    description: 'Claim the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'claim-this',
    privileged: false,
  },
  {
    name: 'approve-this',
    description: 'Approve the lifecycle item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'approve-this',
    privileged: true,
  },
  {
    name: 'block-this',
    description: 'Block the lifecycle item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'block-this',
    privileged: false,
  },
  {
    name: 'complete-this',
    description: 'Complete the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'complete-this',
    privileged: false,
  },
  {
    name: 'pause-this',
    description: 'Pause automation for the item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'pause-this',
    privileged: false,
  },
  {
    name: 'resume-this',
    description: 'Resume automation for the item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'resume-this',
    privileged: false,
  },
  {
    name: 'retry-gates',
    description: 'Retry gates for the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'retry-gates',
    privileged: false,
  },
  {
    name: 'merge-now',
    description: 'Request merge for the pull request bound to this thread.',
    type: applicationCommandType,
    action: 'merge-now',
    privileged: true,
  },
  {
    name: 'rebase-dependents',
    description: 'Rebase branches that depend on the bound work item.',
    type: applicationCommandType,
    action: 'rebase-all-dependents',
    privileged: true,
  },
  {
    name: 'sync-worktree',
    description: 'Synchronize the worktree bound to this Discord thread.',
    type: applicationCommandType,
    action: 'sync-worktree',
    privileged: false,
  },
  {
    name: 'release-worktree',
    description: 'Release the worktree bound to this Discord thread.',
    type: applicationCommandType,
    action: 'release-worktree',
    privileged: true,
  },
  {
    name: 'show-status',
    description: 'Show status for the item bound to this Discord thread.',
    type: applicationCommandType,
    action: 'show-status',
    privileged: false,
  },
  {
    name: 'show-last-artifact',
    description: 'Show the latest artifact for this Discord thread.',
    type: applicationCommandType,
    action: 'show-last-artifact',
    privileged: false,
  },
  {
    name: 'explain-failure',
    description: 'Explain the latest failure for this Discord thread.',
    type: applicationCommandType,
    action: 'explain-failure',
    privileged: false,
  },
  {
    name: 'update-spec',
    description: 'Update the spec bound to this Discord thread.',
    type: applicationCommandType,
    action: 'update-spec',
    privileged: false,
  },
];

export function createDiscordCommandContractRegistry(): DiscordCommandContractRegistry {
  return {
    version: 1,
    contracts: commandContracts.map((contract) => ({
      ...contract,
    })),
  };
}

export function resolveDiscordCommandAction(
  commandName: string,
): DiscordControlAction | undefined {
  return commandContracts.find((contract) => contract.name === commandName)
    ?.action;
}

export function createDiscordApplicationCommandPayloads(): readonly Pick<
  DiscordCommandContract,
  'name' | 'description' | 'type'
>[] {
  return commandContracts.map((contract) => ({
    name: contract.name,
    description: contract.description,
    type: contract.type,
  }));
}

import {
  DEVPLAT_ACTION_ALTERNATIVES,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_CONSIDER,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_PHASE_CONTRACT,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
  DEVPLAT_ACTION_PROJECT_SUMMARY,
  DEVPLAT_ACTION_REDIRECT,
  DEVPLAT_ACTION_RELEASE_PROJECT,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESEARCH,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SPEC,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
} from '@vannadii/devplat-core';

import type { DiscordControlAction } from '../discord-control-plane/codec.js';
import type {
  DiscordApplicationCommandType,
  DiscordCommandContract,
  DiscordCommandContractRegistry,
} from './codec.js';

/**
 * Discord application command type for chat-input slash commands.
 */
const applicationCommandType: DiscordApplicationCommandType = 1;

/**
 * Versioned Discord slash-command contracts exposed to operators.
 */
const commandContracts: readonly DiscordCommandContract[] = [
  {
    name: DEVPLAT_ACTION_NEW_PROJECT,
    description: 'Bootstrap a project from Discord-only operator controls.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_NEW_PROJECT,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_OPEN_PROJECT,
    description: 'Open a project dashboard and route commands by context.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_OPEN_PROJECT,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_PROJECT_SUMMARY,
    description: 'Show a read-only project summary across lifecycle phases.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_PROJECT_SUMMARY,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_PROJECT_SETTINGS,
    description: 'Update project settings using named options or controls.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_PROJECT_SETTINGS,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
    description: 'Show append-only settings history for the active project.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_CANCEL_PROJECT,
    description:
      'Pause all project work and post per-phase cancellation state.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_CANCEL_PROJECT,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_RESUME_PROJECT,
    description: 'Run project preflight checks and resume paused project work.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RESUME_PROJECT,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_RELEASE_PROJECT,
    description: 'Start release orchestration for the active project.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RELEASE_PROJECT,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_PHASE_CONTRACT,
    description:
      'Show the authoritative phase command contract for this thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_PHASE_CONTRACT,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_ALTERNATIVES,
    description: 'Show three alternatives with effort and risk profile.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_ALTERNATIVES,
    privileged: false,
  },
  {
    name: 'alts',
    description: 'Alias for /alternatives.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_ALTERNATIVES,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_REDIRECT,
    description: 'Replace discovery direction for the next research updates.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_REDIRECT,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_CONSIDER,
    description: 'Queue a URL for the next research update.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_CONSIDER,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_RESEARCH,
    description: 'Run or re-enter research for the bound project context.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RESEARCH,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_SPEC,
    description: 'Generate a research summary and request spec approval.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_SPEC,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_RUN_THIS,
    description: 'Run the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RUN_THIS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_CLAIM_THIS,
    description: 'Claim the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_CLAIM_THIS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_APPROVE_THIS,
    description: 'Approve the lifecycle item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_APPROVE_THIS,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_BLOCK_THIS,
    description: 'Block the lifecycle item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_BLOCK_THIS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_COMPLETE_THIS,
    description: 'Complete the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_COMPLETE_THIS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_PAUSE_THIS,
    description: 'Pause automation for the item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_PAUSE_THIS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_RESUME_THIS,
    description: 'Resume automation for the item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RESUME_THIS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_RETRY_GATES,
    description: 'Retry gates for the work item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RETRY_GATES,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_MERGE_NOW,
    description: 'Request merge for the pull request bound to this thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_MERGE_NOW,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_REBASE_DEPENDENTS,
    description: 'Rebase branches that depend on the bound work item.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_SYNC_WORKTREE,
    description: 'Synchronize the worktree bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_SYNC_WORKTREE,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_RELEASE_WORKTREE,
    description: 'Release the worktree bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_RELEASE_WORKTREE,
    privileged: true,
  },
  {
    name: DEVPLAT_ACTION_SHOW_STATUS,
    description: 'Show status for the item bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_SHOW_STATUS,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    description: 'Show the latest artifact for this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_EXPLAIN_FAILURE,
    description: 'Explain the latest failure for this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_EXPLAIN_FAILURE,
    privileged: false,
  },
  {
    name: DEVPLAT_ACTION_UPDATE_SPEC,
    description: 'Update the spec bound to this Discord thread.',
    type: applicationCommandType,
    action: DEVPLAT_ACTION_UPDATE_SPEC,
    privileged: false,
  },
];

/**
 * Creates the versioned Discord command registry from the contract table.
 */
export function createDiscordCommandContractRegistry(): DiscordCommandContractRegistry {
  return {
    version: 1,
    contracts: commandContracts.map((contract) => ({
      ...contract,
    })),
  };
}

/**
 * Resolves a slash-command name to the lifecycle action it controls.
 */
export function resolveDiscordCommandAction(
  commandName: string,
): DiscordControlAction | undefined {
  return commandContracts.find((contract) => contract.name === commandName)
    ?.action;
}

/**
 * Creates Discord application-command registration payloads.
 */
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

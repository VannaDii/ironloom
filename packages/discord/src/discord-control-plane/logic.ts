import {
  appendTrace,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_REBASE_DEPENDENTS,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_RELEASE_PROJECT,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_CONSIDER,
  DEVPLAT_ACTION_REDIRECT,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SPEC,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
  DEVPLAT_ACTION_PAUSE_THIS,
} from '@vannadii/devplat-core';

import {
  createDiscordCommandContractRegistry,
  resolveDiscordCommandAction,
} from '../command-contract/logic.js';
import {
  DISCORD_COMPONENT_CUSTOM_ID_PREFIX,
  DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH,
  DISCORD_PROJECT_NAME_MAX_LENGTH,
  DISCORD_PROJECT_NAME_MIN_LENGTH,
  DISCORD_SUMMARY_MARKER_TOKEN_PATTERN,
} from './constants.js';
import type {
  DiscordControlAction,
  DiscordControlRequest,
  DiscordInteractionCallback,
  DiscordInteractionCallbackOptions,
  DiscordInteractionRoute,
  DiscordOperatorInteraction,
  DiscordReceivedEventDataSnapshot,
  DiscordReceivedEventMemberSnapshot,
  DiscordReceivedEventSnapshot,
  DiscordReceivedEventUserSnapshot,
  DiscordWorkItemBinding,
} from './codec.js';
import type { DiscordThreadSession } from '../thread-session/codec.js';

/**
 * Parsed DevPlat component custom-id context.
 */
type DiscordComponentCustomIdContext = {
  readonly action: DiscordControlAction;
  readonly threadId: string;
};

/**
 * Supported immutable run intents for `/open-project`.
 */
type OpenProjectIntent = 'maintenance' | 'bugfix' | 'new-feature';

/**
 * Supported `/new-project --quality-strictness` option values.
 */
type NewProjectQualityStrictness = 'on' | 'off';

/**
 * Logical operator roles used for interaction-time authorization checks.
 */
type DevplatOperatorRole =
  | 'project-operator'
  | 'spec-approver'
  | 'merge-approver';

/**
 * Human and component action tokens accepted by the operator router.
 */
const commandActionMap = new Map<string, DiscordControlAction>([
  ['run this', DEVPLAT_ACTION_RUN_THIS],
  [DEVPLAT_ACTION_RUN_THIS, DEVPLAT_ACTION_RUN_THIS],
  ['claim this', DEVPLAT_ACTION_CLAIM_THIS],
  [DEVPLAT_ACTION_CLAIM_THIS, DEVPLAT_ACTION_CLAIM_THIS],
  ['approve this', DEVPLAT_ACTION_APPROVE_THIS],
  [DEVPLAT_ACTION_APPROVE_THIS, DEVPLAT_ACTION_APPROVE_THIS],
  ['block this', DEVPLAT_ACTION_BLOCK_THIS],
  [DEVPLAT_ACTION_BLOCK_THIS, DEVPLAT_ACTION_BLOCK_THIS],
  ['complete this', DEVPLAT_ACTION_COMPLETE_THIS],
  [DEVPLAT_ACTION_COMPLETE_THIS, DEVPLAT_ACTION_COMPLETE_THIS],
  ['pause this', DEVPLAT_ACTION_PAUSE_THIS],
  [DEVPLAT_ACTION_PAUSE_THIS, DEVPLAT_ACTION_PAUSE_THIS],
  ['resume this', DEVPLAT_ACTION_RESUME_THIS],
  [DEVPLAT_ACTION_RESUME_THIS, DEVPLAT_ACTION_RESUME_THIS],
  ['retry gates', DEVPLAT_ACTION_RETRY_GATES],
  [DEVPLAT_ACTION_RETRY_GATES, DEVPLAT_ACTION_RETRY_GATES],
  ['merge now', DEVPLAT_ACTION_MERGE_NOW],
  [DEVPLAT_ACTION_MERGE_NOW, DEVPLAT_ACTION_MERGE_NOW],
  ['rebase dependents', DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS],
  [DEVPLAT_ACTION_REBASE_DEPENDENTS, DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS],
  [DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS, DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS],
  ['sync worktree', DEVPLAT_ACTION_SYNC_WORKTREE],
  [DEVPLAT_ACTION_SYNC_WORKTREE, DEVPLAT_ACTION_SYNC_WORKTREE],
  ['release worktree', DEVPLAT_ACTION_RELEASE_WORKTREE],
  [DEVPLAT_ACTION_RELEASE_WORKTREE, DEVPLAT_ACTION_RELEASE_WORKTREE],
  ['show status', DEVPLAT_ACTION_SHOW_STATUS],
  [DEVPLAT_ACTION_SHOW_STATUS, DEVPLAT_ACTION_SHOW_STATUS],
  ['show last artifact', DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  [DEVPLAT_ACTION_SHOW_LAST_ARTIFACT, DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  ['explain failure', DEVPLAT_ACTION_EXPLAIN_FAILURE],
  [DEVPLAT_ACTION_EXPLAIN_FAILURE, DEVPLAT_ACTION_EXPLAIN_FAILURE],
  ['update spec', DEVPLAT_ACTION_UPDATE_SPEC],
  [DEVPLAT_ACTION_UPDATE_SPEC, DEVPLAT_ACTION_UPDATE_SPEC],
]);

/**
 * Cached Discord command contracts used for routing-time metadata lookups.
 */
const commandContracts = createDiscordCommandContractRegistry().contracts;

/**
 * Maps command names to privileged-policy flags from the command contract registry.
 */
const commandPrivilegedMap = new Map<string, boolean>(
  commandContracts.map((contract) => [contract.name, contract.privileged]),
);

/**
 * Tracks action tokens that are privileged by contract for component interactions.
 */
const privilegedActionSet = new Set<DiscordControlAction>(
  commandContracts
    .filter((contract) => contract.privileged)
    .map((contract) => contract.action),
);
/**
 * Maps canonical control actions to privileged-policy flags.
 */
function resolveInteractionPrivileged(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
): boolean {
  if (input.privileged !== undefined) {
    return input.privileged;
  }
  if (input.commandName === undefined) {
    return privilegedActionSet.has(action);
  }
  return commandPrivilegedMap.get(input.commandName) ?? false;
}

/**
 * Resolves a known action token into a control action.
 */
function resolveKnownAction(
  value: string | undefined,
): DiscordControlAction | undefined {
  return value === undefined
    ? undefined
    : (commandActionMap.get(value) ?? resolveDiscordCommandAction(value));
}

/**
 * Resolves role requirements for a control action in the current thread context.
 */
function resolveRequiredRolesForAction(
  action: DiscordControlAction,
  input: DiscordOperatorInteraction,
): readonly DevplatOperatorRole[] {
  switch (action) {
    case DEVPLAT_ACTION_NEW_PROJECT:
    case DEVPLAT_ACTION_OPEN_PROJECT:
    case DEVPLAT_ACTION_PROJECT_SETTINGS:
    case DEVPLAT_ACTION_CANCEL_PROJECT:
    case DEVPLAT_ACTION_RESUME_PROJECT:
      return ['project-operator'];
    case DEVPLAT_ACTION_RELEASE_PROJECT:
      return ['project-operator', 'merge-approver'];
    case DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY:
      return input.projectSettingsHistoryDetailed ? ['project-operator'] : [];
    case DEVPLAT_ACTION_APPROVE_THIS:
      return input.boundSession?.kind === 'pull-request'
        ? ['merge-approver']
        : ['spec-approver'];
    case DEVPLAT_ACTION_MERGE_NOW:
      return ['merge-approver'];
    default:
      return [];
  }
}

/**
 * Resolves the configured role id for a logical DevPlat operator role.
 */
function resolveConfiguredRoleId(
  role: DevplatOperatorRole,
  input: DiscordOperatorInteraction,
): string | undefined {
  switch (role) {
    case 'project-operator':
      return trimOptional(input.projectOperatorRoleId);
    case 'spec-approver':
      return trimOptional(input.specApproverRoleId);
    case 'merge-approver':
      return trimOptional(input.mergeApproverRoleId);
  }
}

/**
 * Resolves role authorization outcome for an action.
 */
function resolveRoleAuthorizationFailure(
  action: DiscordControlAction,
  input: DiscordOperatorInteraction,
  threadId: string,
): string | undefined {
  const requiredRoles = resolveRequiredRolesForAction(action, input);
  if (requiredRoles.length === 0) {
    return undefined;
  }

  const missingMappings: DevplatOperatorRole[] = [];
  const requiredRoleIds: string[] = [];
  for (const role of requiredRoles) {
    const roleId = resolveConfiguredRoleId(role, input);
    if (roleId === undefined) {
      missingMappings.push(role);
      continue;
    }
    requiredRoleIds.push(roleId);
  }

  if (requiredRoleIds.length === 0 && missingMappings.length > 0) {
    return (
      `permission denied: caller=${input.actorId} action=${action} requiredRole=${requiredRoles.join('|')} ` +
      `context=thread:${threadId} missingRoleMapping=${missingMappings.join('|')}`
    );
  }

  const actorRoleIds = (input.actorRoleIds ?? []).map((roleId) =>
    roleId.trim(),
  );
  const hasRequiredRole = requiredRoleIds.some((requiredRoleId) =>
    actorRoleIds.includes(requiredRoleId),
  );
  if (hasRequiredRole) {
    return undefined;
  }

  const missingRoleMappingSuffix =
    missingMappings.length === 0
      ? ''
      : ` missingRoleMapping=${missingMappings.join('|')}`;
  return (
    `permission denied: caller=${input.actorId} action=${action} requiredRole=${requiredRoles.join('|')} ` +
    `context=thread:${threadId}${missingRoleMappingSuffix}`
  );
}

/**
 * Returns a route-failure reason when a project name is outside allowed bounds.
 */
function resolveProjectNameLengthFailureReason(
  action: DiscordControlAction,
  projectName: string,
): string | undefined {
  const length = projectName.length;
  if (
    length >= DISCORD_PROJECT_NAME_MIN_LENGTH &&
    length <= DISCORD_PROJECT_NAME_MAX_LENGTH
  ) {
    return undefined;
  }

  return `${action} requires --project length ${String(DISCORD_PROJECT_NAME_MIN_LENGTH)}-${String(DISCORD_PROJECT_NAME_MAX_LENGTH)} characters.`;
}

/**
 * Returns route-failure reason when project bootstrap/reopen requirements fail.
 */
function resolveProjectRouteRequirementFailureReason(
  action: DiscordControlAction,
  input: DiscordOperatorInteraction,
): string | undefined {
  if (action === DEVPLAT_ACTION_OPEN_PROJECT) {
    if (input.projectRepo === undefined || input.projectName === undefined) {
      return 'open-project requires --repo <repo_name> and --project <project_name>.';
    }
    if (input.openProjectIntent === undefined) {
      return 'open-project requires --intent maintenance|bugfix|new-feature.';
    }
    return resolveProjectNameLengthFailureReason(action, input.projectName);
  }

  if (action === DEVPLAT_ACTION_NEW_PROJECT) {
    if (input.projectRepo === undefined || input.projectName === undefined) {
      return 'new-project requires --repo <repo_name> and --project <project_name>.';
    }
    return resolveProjectNameLengthFailureReason(action, input.projectName);
  }

  if (
    action === DEVPLAT_ACTION_REDIRECT &&
    input.redirectPrompt === undefined
  ) {
    return 'redirect requires --direction-prompt <text>.';
  }

  if (action === DEVPLAT_ACTION_CONSIDER && input.considerUrl === undefined) {
    return 'consider requires --url <value>.';
  }

  return undefined;
}

/**
 * Parses the versioned component custom id produced by the Discord renderer.
 */
function parseDiscordComponentCustomId(
  value: string | undefined,
): DiscordComponentCustomIdContext | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  const prefix = `${DISCORD_COMPONENT_CUSTOM_ID_PREFIX}:`;
  if (!trimmed.startsWith(prefix)) {
    return undefined;
  }

  const suffix = trimmed.slice(prefix.length);
  const separatorIndex = suffix.indexOf(':');
  if (
    separatorIndex < 1 ||
    separatorIndex === suffix.length - 1 ||
    suffix.indexOf(':', separatorIndex + 1) !== -1
  ) {
    return undefined;
  }

  const actionToken = suffix.slice(0, separatorIndex);
  const threadToken = suffix.slice(separatorIndex + 1);
  const action = resolveKnownAction(actionToken);
  const threadId = threadToken.trim();
  if (action === undefined || threadId.length === 0) {
    return undefined;
  }

  return {
    action,
    threadId,
  };
}

/**
 * Extracts the encoded thread id from a DevPlat Discord component custom id.
 */
export function resolveDiscordComponentThreadId(
  value: string | undefined,
): string | undefined {
  return parseDiscordComponentCustomId(value)?.threadId;
}

/** Normalizes action token. */
function normalizeActionToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed.startsWith('devplat:')
    ? trimmed.slice('devplat:'.length)
    : trimmed;
}

/** Resolves action. */
function resolveAction(
  input: DiscordOperatorInteraction,
): DiscordControlAction | undefined {
  const normalizedCommand = normalizeActionToken(input.commandName);
  const commandAction = resolveKnownAction(normalizedCommand);
  const componentContext = parseDiscordComponentCustomId(input.customId);
  const customAction =
    componentContext?.action ??
    commandActionMap.get(normalizeActionToken(input.customId) ?? '');

  if (commandAction !== undefined && customAction !== undefined) {
    return commandAction === customAction ? commandAction : undefined;
  }

  return commandAction ?? customAction;
}

/** Collects thread candidates. */
function collectThreadCandidates(
  input: DiscordOperatorInteraction,
): readonly string[] {
  const componentContext = parseDiscordComponentCustomId(input.customId);

  return [
    ...(input.threadId === undefined ? [] : [input.threadId.trim()]),
    ...(input.boundThreadId === undefined ? [] : [input.boundThreadId.trim()]),
    ...(componentContext === undefined ? [] : [componentContext.threadId]),
    ...(input.boundSession === undefined
      ? []
      : [input.boundSession.threadId.trim()]),
  ].filter((value) => value.length > 0);
}

/** Returns true when a thread-id token represents a concrete thread binding. */
function isResolvableThreadId(value: string | undefined): value is string {
  if (value === undefined) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.length > 0 &&
    normalized !== 'unresolved' &&
    normalized !== 'ambiguous'
  );
}

/** Trims an optional string value. */
function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  return trimmed;
}

/** Resolves `/open-project --intent ...` from callback options. */
function resolveOpenProjectIntentFromCallback(
  input: DiscordInteractionCallback,
): OpenProjectIntent | undefined {
  const options = input.data?.options;
  if (options === undefined) {
    return undefined;
  }

  const intentOption = options.find(
    (option) => option.name.trim().toLowerCase() === 'intent',
  );
  const intentValue = trimOptional(intentOption?.value)?.toLowerCase();
  switch (intentValue) {
    case 'maintenance':
      return 'maintenance';
    case 'bugfix':
      return 'bugfix';
    case 'new-feature':
      return 'new-feature';
    default:
      return undefined;
  }
}

/** Resolves a named string option from callback options. */
function resolveNamedOptionFromCallback(
  input: DiscordInteractionCallback,
  name: string,
): string | undefined {
  const options = input.data?.options;
  if (options === undefined) {
    return undefined;
  }

  const resolvedOption = options.find(
    (option) => option.name.trim().toLowerCase() === name,
  );
  return trimOptional(resolvedOption?.value);
}

/** Resolves `/resume-project --force` from callback options. */
function resolveResumeProjectForceFromCallback(
  input: DiscordInteractionCallback,
): boolean | undefined {
  const forceValue = resolveNamedOptionFromCallback(
    input,
    'force',
  )?.toLowerCase();
  return forceValue === undefined ? undefined : forceValue === 'force';
}

/** Resolves `/project-settings-history --mode` callback option. */
function resolveProjectSettingsHistoryDetailedFromCallback(
  input: DiscordInteractionCallback,
): boolean | undefined {
  const modeValue = resolveNamedOptionFromCallback(
    input,
    'mode',
  )?.toLowerCase();
  if (modeValue === undefined) {
    return undefined;
  }

  return modeValue === 'detailed';
}

/** Resolves `/new-project --quality-strictness` from callback options. */
function resolveNewProjectQualityStrictnessFromCallback(
  input: DiscordInteractionCallback,
): NewProjectQualityStrictness | undefined {
  const strictnessValue = resolveNamedOptionFromCallback(
    input,
    'quality-strictness',
  )?.toLowerCase();

  if (strictnessValue === 'on') {
    return 'on';
  }

  if (strictnessValue === 'off') {
    return 'off';
  }

  return undefined;
}

/**
 * Creates optional interaction fields for new-project quality strictness.
 */
function createNewProjectQualityStrictnessInteractionFields(
  value: NewProjectQualityStrictness | undefined,
): Pick<DiscordOperatorInteraction, 'newProjectQualityStrictness'> | object {
  if (value === undefined) {
    return {};
  }

  return { newProjectQualityStrictness: value };
}

/**
 * Resolves callback-derived optional interaction fields.
 */
function resolveCallbackOptionalInteractionFields(
  input: DiscordInteractionCallback,
  options: DiscordInteractionCallbackOptions,
): {
  readonly openProjectIntent?: OpenProjectIntent;
  readonly projectRepo?: string;
  readonly projectName?: string;
  readonly resumeProjectForce?: boolean;
  readonly projectSettingsHistoryDetailed?: boolean;
  readonly newProjectQualityStrictness?: NewProjectQualityStrictness;
  readonly redirectPrompt?: string;
  readonly considerUrl?: string;
} {
  const openProjectIntent =
    resolveOpenProjectIntentFromCallback(input) ?? options.openProjectIntent;
  const projectRepo =
    resolveNamedOptionFromCallback(input, 'repo') ?? options.projectRepo;
  const projectName =
    resolveNamedOptionFromCallback(input, 'project') ?? options.projectName;
  const resumeProjectForce =
    resolveResumeProjectForceFromCallback(input) ?? options.resumeProjectForce;
  const projectSettingsHistoryDetailed =
    resolveProjectSettingsHistoryDetailedFromCallback(input) ??
    options.projectSettingsHistoryDetailed;
  const newProjectQualityStrictness =
    resolveNewProjectQualityStrictnessFromCallback(input) ??
    options.newProjectQualityStrictness;
  const redirectPrompt =
    resolveNamedOptionFromCallback(input, 'direction-prompt') ??
    options.redirectPrompt;
  const considerUrl =
    resolveNamedOptionFromCallback(input, 'url') ?? options.considerUrl;

  return {
    ...(openProjectIntent === undefined ? {} : { openProjectIntent }),
    ...(projectRepo === undefined ? {} : { projectRepo }),
    ...(projectName === undefined ? {} : { projectName }),
    ...(resumeProjectForce === undefined ? {} : { resumeProjectForce }),
    ...(projectSettingsHistoryDetailed === undefined
      ? {}
      : { projectSettingsHistoryDetailed }),
    ...createNewProjectQualityStrictnessInteractionFields(
      newProjectQualityStrictness,
    ),
    ...(redirectPrompt === undefined ? {} : { redirectPrompt }),
    ...(considerUrl === undefined ? {} : { considerUrl }),
  };
}

/**
 * Creates the minimal command data snapshot used by route-failure diagnostics.
 */
function createDiscordReceivedEventDataSnapshot(
  input: DiscordInteractionCallback['data'],
): DiscordReceivedEventDataSnapshot | undefined {
  const name = trimOptional(input?.name);
  const customId = trimOptional(input?.custom_id);

  if (name === undefined && customId === undefined) {
    return undefined;
  }

  return {
    ...(name === undefined ? {} : { name }),
    ...(customId === undefined ? {} : { custom_id: customId }),
  };
}

/**
 * Creates the minimal user identity snapshot used by route-failure diagnostics.
 */
function createDiscordReceivedEventUserSnapshot(
  input: DiscordInteractionCallback['user'],
): DiscordReceivedEventUserSnapshot | undefined {
  const id = trimOptional(input?.id);
  return id === undefined ? undefined : { id };
}

/**
 * Creates the minimal member identity snapshot used by route-failure diagnostics.
 */
function createDiscordReceivedEventMemberSnapshot(
  input: DiscordInteractionCallback['member'],
): DiscordReceivedEventMemberSnapshot | undefined {
  const user = createDiscordReceivedEventUserSnapshot(input?.user);
  if (user === undefined) {
    return undefined;
  }

  const roles = input?.roles?.map((roleId) => roleId.trim()).filter(Boolean);
  return roles === undefined || roles.length === 0 ? { user } : { user, roles };
}

/**
 * Creates the bounded received-event diagnostic used by route failures.
 */
function createDiscordReceivedEventSnapshot(
  input: DiscordInteractionCallback,
): DiscordReceivedEventSnapshot {
  const data = createDiscordReceivedEventDataSnapshot(input.data);
  const member = createDiscordReceivedEventMemberSnapshot(input.member);
  const user = createDiscordReceivedEventUserSnapshot(input.user);

  return {
    id: input.id,
    token: input.token,
    channel_id: input.channel_id,
    ...(data === undefined ? {} : { data }),
    ...(member === undefined ? {} : { member }),
    ...(user === undefined ? {} : { user }),
  };
}

/** Resolves callback actor id. */
function resolveCallbackActorId(input: DiscordInteractionCallback): string {
  const memberUserId = trimOptional(input.member?.user.id);
  if (memberUserId !== undefined) {
    return memberUserId;
  }

  const directUserId = trimOptional(input.user?.id);
  if (directUserId !== undefined) {
    return directUserId;
  }

  throw new Error(
    'Discord interaction callback must include an actor user id.',
  );
}

/** Resolves callback channel id. */
function resolveCallbackChannelId(input: DiscordInteractionCallback): string {
  const channelId = input.channel_id.trim();
  if (channelId.length === 0) {
    throw new Error('Discord interaction callback must include a channel id.');
  }

  return channelId;
}

/** Creates discord work item binding. */
export function createDiscordWorkItemBinding(
  session: DiscordThreadSession,
): DiscordWorkItemBinding {
  const base = {
    threadKind: session.kind,
    threadId: session.threadId,
    artifactId: session.artifactId,
  };

  switch (session.kind) {
    case DEVPLAT_ACTION_SPEC:
      return {
        ...base,
        specId: session.specId,
      };
    case 'implementation':
      return session.specId === null
        ? {
            ...base,
            sliceId: session.sliceId,
          }
        : {
            ...base,
            specId: session.specId,
            sliceId: session.sliceId,
          };
    case 'pull-request':
      return {
        ...base,
        ...(session.specId === null ? {} : { specId: session.specId }),
        ...(session.sliceId === null ? {} : { sliceId: session.sliceId }),
        pullRequestNumber: session.pullRequestNumber,
      };
  }
}

/** Describes discord work item binding. */
export function describeDiscordWorkItemBinding(
  input: DiscordWorkItemBinding,
): string {
  if (input.threadKind === 'pull-request') {
    return input.pullRequestNumber === undefined
      ? `pull-request ${input.threadId}`
      : `pull-request #${String(input.pullRequestNumber)} in ${input.threadId}`;
  }

  if (input.threadKind === 'implementation') {
    return input.sliceId === undefined
      ? `implementation ${input.threadId}`
      : `implementation ${input.sliceId} in ${input.threadId}`;
  }

  return input.specId === undefined
    ? `spec ${input.threadId}`
    : `spec ${input.specId} in ${input.threadId}`;
}

/** Creates discord control request. */
export function createDiscordControlRequest(
  input: DiscordControlRequest,
): DiscordControlRequest {
  if (input.threadId.trim().length === 0) {
    throw new Error('Discord control requests must be scoped to a thread.');
  }

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
    },
    `discord:${input.threadId}:${input.action}`,
  );
}

/** Describes discord control request. */
export function describeDiscordControlRequest(
  input: DiscordControlRequest,
): string {
  return `${input.threadId}:${input.action} -> ${input.summary}`;
}

/** Creates discord operator interaction from callback. */
export function createDiscordOperatorInteractionFromCallback(
  input: DiscordInteractionCallback,
  options: DiscordInteractionCallbackOptions = {},
): DiscordOperatorInteraction {
  const channelId = resolveCallbackChannelId(input);
  const commandName = trimOptional(input.data?.name);
  const customId = trimOptional(input.data?.custom_id);
  const summary = trimOptional(options.summary);
  const callbackOptionFields = resolveCallbackOptionalInteractionFields(
    input,
    options,
  );

  return {
    id: input.id,
    token: input.token,
    actorId: resolveCallbackActorId(input),
    channelId,
    updatedAt: options.updatedAt ?? new Date().toISOString(),
    threadId: options.threadId ?? channelId,
    ...(commandName === undefined ? {} : { commandName }),
    ...(customId === undefined ? {} : { customId }),
    receivedEvent: createDiscordReceivedEventSnapshot(input),
    ...(options.boundThreadId === undefined
      ? {}
      : { boundThreadId: options.boundThreadId }),
    ...(options.boundSession === undefined
      ? {}
      : { boundSession: options.boundSession }),
    ...(summary === undefined ? {} : { summary }),
    ...callbackOptionFields,
    ...(input.member?.roles === undefined
      ? {}
      : {
          actorRoleIds: input.member.roles
            .map((roleId) => roleId.trim())
            .filter((roleId) => roleId.length > 0),
        }),
    ...(options.projectOperatorRoleId === undefined
      ? {}
      : { projectOperatorRoleId: options.projectOperatorRoleId }),
    ...(options.specApproverRoleId === undefined
      ? {}
      : { specApproverRoleId: options.specApproverRoleId }),
    ...(options.mergeApproverRoleId === undefined
      ? {}
      : { mergeApproverRoleId: options.mergeApproverRoleId }),
    ...(options.privileged === undefined
      ? {}
      : { privileged: options.privileged }),
  };
}

/** Sanitizes summary marker values to avoid marker-injection ambiguity. */
function sanitizeSummaryMarkerValue(value: string): string {
  return value
    .split('(')
    .join('[')
    .split(')')
    .join(']')
    .split(':')
    .join('-')
    .split('|')
    .join('/')
    .split('\r')
    .join(' ')
    .split('\n')
    .join(' ')
    .split('\t')
    .join(' ')
    .split('`')
    .join("'")
    .trim();
}

/**
 * Encodes marker values that must round-trip without delimiter loss.
 */
function encodeSummaryMarkerValue(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** Sanitizes repo/project markers to keep persisted identity keys path-safe. */
function sanitizeStorageMarkerValue(value: string): string {
  return sanitizeSummaryMarkerValue(value)
    .split('/')
    .join('-')
    .split('\\')
    .join('-')
    .split('..')
    .join('--')
    .trim();
}

/** Truncates a free-form summary prefix while preserving structured suffix markers. */
function truncateSummaryMarkerToken(token: string): string {
  if (token.length <= DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH) {
    return token;
  }

  const markerValueSeparatorIndex = token.indexOf(':');
  const markerClosingParenIndex = token.lastIndexOf(')');
  if (
    markerValueSeparatorIndex <= 1 ||
    markerClosingParenIndex <= markerValueSeparatorIndex
  ) {
    return token.slice(0, DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH);
  }

  const markerPrefix = token.slice(0, markerValueSeparatorIndex + 1);
  const markerSuffixToken = ')';
  const maxMarkerValueLength =
    DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH -
    markerPrefix.length -
    markerSuffixToken.length;
  const markerValue = token.slice(
    markerValueSeparatorIndex + 1,
    markerClosingParenIndex,
  );
  const boundedMarkerValue =
    maxMarkerValueLength <= 0 ? '' : markerValue.slice(0, maxMarkerValueLength);
  return `${markerPrefix}${boundedMarkerValue}${markerSuffixToken}`;
}

/** Keeps complete marker tokens and prefers right-most markers when suffix exceeds bounds. */
function boundSummaryMarkerSuffix(markerSuffix: string): string {
  if (markerSuffix.length <= DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH) {
    return markerSuffix;
  }

  const markerTokens = markerSuffix.match(DISCORD_SUMMARY_MARKER_TOKEN_PATTERN);
  if (markerTokens === null || markerTokens.length === 0) {
    return markerSuffix.slice(0, DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH);
  }

  const retainedMarkers: string[] = [];
  let retainedLength = 0;
  for (let index = markerTokens.length - 1; index >= 0; index -= 1) {
    const markerToken = markerTokens[index];
    if (markerToken === undefined) {
      continue;
    }
    const separatorLength = retainedMarkers.length === 0 ? 0 : 1;
    const nextLength = retainedLength + separatorLength + markerToken.length;
    if (nextLength > DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH) {
      continue;
    }
    retainedMarkers.unshift(markerToken);
    retainedLength = nextLength;
  }

  if (retainedMarkers.length > 0) {
    return retainedMarkers.join(' ');
  }

  const lastMarkerToken = markerTokens.at(-1);
  if (lastMarkerToken === undefined) {
    return '';
  }
  return truncateSummaryMarkerToken(lastMarkerToken);
}

/** Composes a bounded summary from a free-form prefix and structured marker suffix. */
function composeBoundedControlRequestSummary(
  prefix: string,
  markerSuffix: string,
): string {
  const normalizedPrefix = prefix.trim();
  const normalizedSuffix = markerSuffix.trim();
  if (normalizedSuffix.length === 0) {
    return normalizedPrefix.length <= DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH
      ? normalizedPrefix
      : normalizedPrefix.slice(0, DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH);
  }

  const separator = normalizedPrefix.length === 0 ? '' : ' ';
  const boundedSuffix = boundSummaryMarkerSuffix(normalizedSuffix);

  const boundedReservedLength = boundedSuffix.length + separator.length;
  if (boundedReservedLength >= DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH) {
    return boundedSuffix;
  }
  const maxPrefixLength =
    DISCORD_CONTROL_REQUEST_SUMMARY_MAX_LENGTH - boundedReservedLength;
  const boundedPrefix =
    normalizedPrefix.length <= maxPrefixLength
      ? normalizedPrefix
      : normalizedPrefix.slice(0, maxPrefixLength);
  return `${boundedPrefix}${separator}${boundedSuffix}`.trim();
}

/** Builds structured summary markers for interaction-routed control requests. */
function composeInteractionMarkerSuffix(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
): string {
  const markers: string[] = [];
  if (input.projectRepo !== undefined && input.projectName !== undefined) {
    markers.push(`(repo:${sanitizeStorageMarkerValue(input.projectRepo)})`);
    markers.push(`(project:${sanitizeStorageMarkerValue(input.projectName)})`);
  }
  if (
    action === DEVPLAT_ACTION_OPEN_PROJECT &&
    input.openProjectIntent !== undefined
  ) {
    markers.push(`(intent:${input.openProjectIntent})`);
  }
  if (action === DEVPLAT_ACTION_RESUME_PROJECT && input.resumeProjectForce) {
    markers.push('(force:true)');
  }
  if (action === DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY) {
    markers.push(
      input.projectSettingsHistoryDetailed
        ? '(mode:detailed)'
        : '(mode:summary)',
    );
  }
  if (
    action === DEVPLAT_ACTION_NEW_PROJECT &&
    input.newProjectQualityStrictness !== undefined
  ) {
    markers.push(`(quality-strictness:${input.newProjectQualityStrictness})`);
  }
  if (
    action === DEVPLAT_ACTION_REDIRECT &&
    input.redirectPrompt !== undefined
  ) {
    markers.push(
      `(direction-prompt:${sanitizeSummaryMarkerValue(input.redirectPrompt)})`,
    );
  }
  if (action === DEVPLAT_ACTION_CONSIDER && input.considerUrl !== undefined) {
    markers.push(`(url64:${encodeSummaryMarkerValue(input.considerUrl)})`);
  }

  return markers.join(' ');
}

/** Creates optional out-of-band request fields for marker-sensitive payloads. */
function createInteractionMarkerPayloadFields(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
): Pick<DiscordControlRequest, 'redirectPrompt' | 'considerUrl'> | object {
  return {
    ...(action === DEVPLAT_ACTION_REDIRECT && input.redirectPrompt !== undefined
      ? { redirectPrompt: input.redirectPrompt }
      : {}),
    ...(action === DEVPLAT_ACTION_CONSIDER && input.considerUrl !== undefined
      ? { considerUrl: input.considerUrl }
      : {}),
  };
}

/** Creates interaction control request input. */
function createInteractionControlRequestInput(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
  threadId: string,
): DiscordControlRequest {
  const privileged = resolveInteractionPrivileged(input, action);
  const markerSuffix = composeInteractionMarkerSuffix(input, action);
  const summary = composeBoundedControlRequestSummary(
    input.summary?.trim() ?? action,
    markerSuffix,
  );
  const markerPayloadFields = createInteractionMarkerPayloadFields(
    input,
    action,
  );
  const baseRequest: DiscordControlRequest = {
    id: input.id,
    summary,
    status: 'running',
    trace: [],
    updatedAt: input.updatedAt,
    actorId: input.actorId,
    threadId,
    channelId: input.channelId,
    action,
    privileged,
    ...markerPayloadFields,
  };
  if (input.boundSession === undefined) {
    return baseRequest;
  }

  return {
    ...baseRequest,
    workItem: createDiscordWorkItemBinding(input.boundSession),
  };
}

/** Creates discord control request from interaction. */
export function createDiscordControlRequestFromInteraction(
  input: DiscordOperatorInteraction,
): DiscordInteractionRoute {
  const action = resolveAction(input);
  if (action === undefined) {
    return {
      ok: false,
      interactionId: input.id,
      reason: 'Discord interaction action is not recognized.',
    };
  }

  const threadCandidates = [...new Set(collectThreadCandidates(input))];
  if (threadCandidates.length !== 1) {
    const expectedThreadFromSession = trimOptional(
      input.boundSession?.threadId,
    );
    const expectedThreadFromBinding = trimOptional(input.boundThreadId);
    const expectedThreadFromInteraction = trimOptional(input.threadId);
    let expectedThread = 'unresolved';
    if (isResolvableThreadId(expectedThreadFromSession)) {
      expectedThread = expectedThreadFromSession;
    } else if (isResolvableThreadId(expectedThreadFromBinding)) {
      expectedThread = expectedThreadFromBinding;
    } else if (isResolvableThreadId(expectedThreadFromInteraction)) {
      expectedThread = expectedThreadFromInteraction;
    }
    const detectedThread =
      threadCandidates.length === 0 ? 'unresolved' : threadCandidates.join(',');
    return {
      ok: false,
      interactionId: input.id,
      reason:
        `project/thread context mismatch: expected=${expectedThread} detected=${detectedThread}. ` +
        'Recovery: /open-project --repo <repo_name> --project <project_name> --intent maintenance|bugfix|new-feature',
    };
  }

  const projectRouteRequirementFailureReason =
    resolveProjectRouteRequirementFailureReason(action, input);
  if (projectRouteRequirementFailureReason !== undefined) {
    return {
      ok: false,
      interactionId: input.id,
      reason: projectRouteRequirementFailureReason,
    };
  }

  const threadId = threadCandidates.join('');

  const roleAuthorizationFailure = resolveRoleAuthorizationFailure(
    action,
    input,
    threadId,
  );
  if (roleAuthorizationFailure !== undefined) {
    return {
      ok: false,
      interactionId: input.id,
      reason: roleAuthorizationFailure,
    };
  }

  return {
    ok: true,
    request: createDiscordControlRequest(
      createInteractionControlRequestInput(input, action, threadId),
    ),
  };
}

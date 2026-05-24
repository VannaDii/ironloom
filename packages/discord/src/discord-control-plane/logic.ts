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
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SPEC,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_UPDATE_SPEC,
  DEVPLAT_ACTION_PAUSE_THIS,
} from '@vannadii/devplat-core';

import { resolveDiscordCommandAction } from '../command-contract/logic.js';
import { DISCORD_COMPONENT_CUSTOM_ID_PREFIX } from './constants.js';
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
 * Logical operator roles used for interaction-time authorization checks.
 */
type DevplatOperatorRole =
  | 'project-operator'
  | 'spec-approver'
  | 'merge-approver';

/**
 * Minimum allowed project-name length for project bootstrap and reopen routes.
 */
const DISCORD_PROJECT_NAME_MIN_LENGTH = 3;

/**
 * Maximum allowed project-name length for project bootstrap and reopen routes.
 */
const DISCORD_PROJECT_NAME_MAX_LENGTH = 30;

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

  if (missingMappings.length > 0) {
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

  return (
    `permission denied: caller=${input.actorId} action=${action} requiredRole=${requiredRoles.join('|')} ` +
    `context=thread:${threadId}`
  );
}

/**
 * Returns a route-failure reason when a project name is outside allowed bounds.
 */
function resolveProjectNameLengthFailureReason(
  action: DiscordControlAction,
  projectName: string | undefined,
): string | undefined {
  if (projectName === undefined) {
    return undefined;
  }

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
  const callbackIntent = resolveOpenProjectIntentFromCallback(input);
  const resolvedIntent = callbackIntent ?? options.openProjectIntent;
  const callbackProjectRepo = resolveNamedOptionFromCallback(input, 'repo');
  const resolvedProjectRepo = callbackProjectRepo ?? options.projectRepo;
  const callbackProjectName = resolveNamedOptionFromCallback(input, 'project');
  const resolvedProjectName = callbackProjectName ?? options.projectName;
  const callbackResumeForce = resolveResumeProjectForceFromCallback(input);
  const resolvedResumeForce = callbackResumeForce ?? options.resumeProjectForce;

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
    ...(resolvedIntent === undefined
      ? {}
      : { openProjectIntent: resolvedIntent }),
    ...(resolvedProjectRepo === undefined
      ? {}
      : { projectRepo: resolvedProjectRepo }),
    ...(resolvedProjectName === undefined
      ? {}
      : { projectName: resolvedProjectName }),
    ...(resolvedResumeForce === undefined
      ? {}
      : { resumeProjectForce: resolvedResumeForce }),
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

/** Creates interaction control request input. */
function createInteractionControlRequestInput(
  input: DiscordOperatorInteraction,
  action: DiscordControlAction,
  threadId: string,
): DiscordControlRequest {
  const privileged = input.privileged ?? false;
  const intentSuffix =
    action === DEVPLAT_ACTION_OPEN_PROJECT &&
    input.openProjectIntent !== undefined
      ? ` (intent:${input.openProjectIntent})`
      : '';
  const projectContextSuffix =
    input.projectRepo === undefined || input.projectName === undefined
      ? ''
      : ` (repo:${input.projectRepo}) (project:${input.projectName})`;
  const resumeForceSuffix =
    action === DEVPLAT_ACTION_RESUME_PROJECT && input.resumeProjectForce
      ? ' (force:true)'
      : '';
  const summary =
    `${input.summary?.trim() ?? action}${projectContextSuffix}${intentSuffix}${resumeForceSuffix}`.trim();
  if (input.boundSession === undefined) {
    return {
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
    };
  }

  return {
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
    const expectedThread =
      input.boundSession?.threadId ??
      input.boundThreadId?.trim() ??
      'unresolved';
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

  if (
    input.boundSession !== undefined &&
    input.boundSession.threadId !== threadId
  ) {
    return {
      ok: false,
      interactionId: input.id,
      reason:
        `project/thread context mismatch: expected=${input.boundSession.threadId} detected=${threadId}. ` +
        'Recovery: /open-project --repo <repo_name> --project <project_name> --intent maintenance|bugfix|new-feature',
    };
  }

  return {
    ok: true,
    request: createDiscordControlRequest(
      createInteractionControlRequestInput(input, action, threadId),
    ),
  };
}

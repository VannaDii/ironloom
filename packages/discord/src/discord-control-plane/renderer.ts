import {
  DISCORD_ACTION_ROW_COMPONENT_TYPE,
  DISCORD_BUTTON_COMPONENT_TYPE,
  DISCORD_BUTTON_LABEL_MAX_LENGTH,
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_BUTTON_STYLE_SUCCESS,
  DISCORD_COMPONENT_CUSTOM_ID_PREFIX,
  DISCORD_CUSTOM_ID_MAX_LENGTH,
} from './constants.js';
import { describeDiscordWorkItemBinding } from './logic.js';
import type {
  DiscordActionRowComponent,
  DiscordButtonComponent,
  DiscordButtonStyle,
  DiscordControlAction,
  DiscordControlRequest,
  DiscordMessagePayload,
  DiscordOperatorInteraction,
} from './types.js';

/**
 * User-facing display metadata for a Discord control action.
 */
type DiscordActionDisplay = {
  readonly label: string;
  readonly acceptedTitle: string;
  readonly acceptedIndicator: string;
  readonly result: string;
  readonly controls: readonly DiscordControlAction[];
};

/**
 * Input for the shared compact Discord message renderer.
 */
type DiscordMessageContentInput = {
  readonly actionLabel: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly indicator: string;
  readonly result: string;
};

/**
 * Display metadata keyed by the platform control action.
 */
const actionDisplays: Readonly<
  Record<DiscordControlAction, DiscordActionDisplay>
> = {
  'approve-this': {
    label: 'Approve',
    acceptedTitle: 'Approval recorded',
    acceptedIndicator: '🟢',
    result: 'Approved. Ready for the next lifecycle step.',
    controls: ['run-this', 'merge-now', 'show-last-artifact'],
  },
  'block-this': {
    label: 'Block',
    acceptedTitle: 'Work blocked',
    acceptedIndicator: '🔴',
    result: 'Blocked. Automation is paused for this thread.',
    controls: ['explain-failure', 'resume-this', 'show-last-artifact'],
  },
  'claim-this': {
    label: 'Claim',
    acceptedTitle: 'Work claimed',
    acceptedIndicator: '🟢',
    result: 'This thread is now claimed for delivery.',
    controls: ['run-this', 'show-last-artifact', 'show-status'],
  },
  'complete-this': {
    label: 'Complete',
    acceptedTitle: 'Work complete',
    acceptedIndicator: '🟢',
    result: 'Completed. Waiting for supervisor routing.',
    controls: ['run-this', 'show-status', 'show-last-artifact'],
  },
  'explain-failure': {
    label: 'Explain Failure',
    acceptedTitle: 'Failure explanation',
    acceptedIndicator: '🔴',
    result: 'Review the latest failure and choose the next action.',
    controls: ['retry-gates', 'show-last-artifact'],
  },
  'merge-now': {
    label: 'Merge',
    acceptedTitle: 'Merge requested',
    acceptedIndicator: '🟡',
    result: 'Merge request accepted. Policy and gates will be checked first.',
    controls: ['show-status', 'rebase-all-dependents', 'show-last-artifact'],
  },
  'pause-this': {
    label: 'Pause',
    acceptedTitle: 'Automation paused',
    acceptedIndicator: '⏸️',
    result: 'Automation paused for this thread only.',
    controls: ['resume-this', 'show-status', 'show-last-artifact'],
  },
  'rebase-all-dependents': {
    label: 'Rebase Dependents',
    acceptedTitle: 'Rebase requested',
    acceptedIndicator: '🟡',
    result: 'Rebase requested for dependent branches.',
    controls: ['show-status', 'explain-failure', 'show-last-artifact'],
  },
  'release-worktree': {
    label: 'Release Worktree',
    acceptedTitle: 'Worktree release requested',
    acceptedIndicator: '🟢',
    result: 'Releasing the bound worktree if policy allows.',
    controls: ['show-status', 'show-last-artifact'],
  },
  'resume-this': {
    label: 'Resume',
    acceptedTitle: 'Automation resumed',
    acceptedIndicator: '▶️',
    result: 'Automation may continue in this thread.',
    controls: ['run-this', 'pause-this', 'show-last-artifact'],
  },
  'retry-gates': {
    label: 'Retry Gates',
    acceptedTitle: 'Gates retry queued',
    acceptedIndicator: '🟡',
    result: 'Re-running quality gates for this work item.',
    controls: ['show-status', 'explain-failure', 'show-last-artifact'],
  },
  'run-this': {
    label: 'Run',
    acceptedTitle: 'Run requested',
    acceptedIndicator: '🟡',
    result: 'Starting the bound work item.',
    controls: ['show-last-artifact', 'show-status', 'pause-this'],
  },
  'show-last-artifact': {
    label: 'Details',
    acceptedTitle: 'Last artifact',
    acceptedIndicator: '📎',
    result: 'Latest artifact is attached, linked, or summarized below.',
    controls: ['show-last-artifact', 'show-status', 'explain-failure'],
  },
  'show-status': {
    label: 'Show Status',
    acceptedTitle: 'Status',
    acceptedIndicator: 'ℹ️',
    result: 'Current lifecycle status is available.',
    controls: ['run-this', 'retry-gates', 'show-last-artifact'],
  },
  'sync-worktree': {
    label: 'Sync Worktree',
    acceptedTitle: 'Worktree sync queued',
    acceptedIndicator: '🟡',
    result: 'Synchronizing the bound worktree.',
    controls: ['show-status', 'release-worktree', 'show-last-artifact'],
  },
  'update-spec': {
    label: 'Update Spec',
    acceptedTitle: 'Spec update requested',
    acceptedIndicator: '🟡',
    result: 'Updating the bound spec from this thread context.',
    controls: ['show-status', 'approve-this', 'show-last-artifact'],
  },
};

/**
 * Default controls for route failures and policy-denied messages.
 */
const failureControls: readonly DiscordControlAction[] = [
  'show-last-artifact',
  'show-status',
];

/**
 * Default controls for policy-denied actions.
 */
const blockedControls: readonly DiscordControlAction[] = [
  'show-last-artifact',
  'show-status',
  'explain-failure',
];

/**
 * Mentions are rendered as text only unless a future caller opts in explicitly.
 */
const safeAllowedMentions = {
  parse: [],
};

/**
 * Resolves display metadata for a control action.
 */
function resolveActionDisplay(
  action: DiscordControlAction,
): DiscordActionDisplay {
  return actionDisplays[action];
}

/**
 * Returns the operator-facing item summary for a request.
 */
function describeDiscordMessageItem(request: DiscordControlRequest): string {
  return request.workItem === undefined
    ? request.summary
    : describeDiscordWorkItemBinding(request.workItem);
}

/**
 * Returns the Discord actor mention text for display without allowing pings.
 */
function describeActor(actorId: string): string {
  return `<@${actorId}>`;
}

/**
 * Builds the canonical DevPlat Discord message body.
 */
function renderDiscordMessageContent(
  input: DiscordMessageContentInput,
): string {
  return [
    `${input.indicator} DevPlat · ${input.actionLabel}`,
    '',
    ...Object.entries(input.fields).map(
      ([fieldName, fieldValue]) => `${fieldName}: ${fieldValue}`,
    ),
    `→ ${input.result}`,
  ].join('\n');
}

/**
 * Builds a compact scope value for a thread-aware request.
 */
function renderDiscordScopeValue(request: DiscordControlRequest): string {
  return `${request.workItem?.threadKind ?? 'thread'} · ${request.threadId}`;
}

/**
 * Builds the compact item value for a thread-aware request.
 */
function renderDiscordItemValue(request: DiscordControlRequest): string {
  return describeDiscordMessageItem(request);
}

/**
 * Creates the compact DevPlat component custom id.
 */
function createDiscordComponentCustomId(
  action: DiscordControlAction,
  threadId: string,
): string {
  const customId = `${DISCORD_COMPONENT_CUSTOM_ID_PREFIX}:${action}:${threadId}`;
  if (customId.length > DISCORD_CUSTOM_ID_MAX_LENGTH) {
    throw new Error('Discord component custom_id exceeds 100 characters.');
  }

  return customId;
}

/**
 * Resolves the Discord button style for a control action.
 */
function resolveButtonStyle(action: DiscordControlAction): DiscordButtonStyle {
  switch (action) {
    case 'approve-this':
      return DISCORD_BUTTON_STYLE_SUCCESS;
    case 'block-this':
    case 'release-worktree':
      return DISCORD_BUTTON_STYLE_DANGER;
    case 'run-this':
    case 'retry-gates':
      return DISCORD_BUTTON_STYLE_PRIMARY;
    case 'claim-this':
    case 'complete-this':
    case 'explain-failure':
    case 'merge-now':
    case 'pause-this':
    case 'rebase-all-dependents':
    case 'resume-this':
    case 'show-last-artifact':
    case 'show-status':
    case 'sync-worktree':
    case 'update-spec':
      return DISCORD_BUTTON_STYLE_SECONDARY;
  }
}

/**
 * Resolves accepted-message controls with state-specific visibility rules.
 */
function resolveAcceptedControls(
  request: DiscordControlRequest,
  display: DiscordActionDisplay,
): readonly DiscordControlAction[] {
  switch (request.action) {
    case 'approve-this':
      return request.workItem?.threadKind === 'pull-request'
        ? display.controls
        : display.controls.filter((action) => action !== 'merge-now');
    case 'block-this':
    case 'claim-this':
    case 'complete-this':
    case 'explain-failure':
    case 'merge-now':
    case 'pause-this':
    case 'rebase-all-dependents':
    case 'release-worktree':
    case 'resume-this':
    case 'retry-gates':
    case 'run-this':
    case 'show-last-artifact':
    case 'show-status':
    case 'sync-worktree':
    case 'update-spec':
      return display.controls;
  }
}

/**
 * Verifies a Discord button label before it is placed into a component.
 */
export function assertDiscordButtonLabelFits(label: string): string {
  if (label.length > DISCORD_BUTTON_LABEL_MAX_LENGTH) {
    throw new Error('Discord button label exceeds 80 characters.');
  }

  return label;
}

/**
 * Creates one button component for a DevPlat control action.
 */
function createDiscordButton(
  request: DiscordControlRequest,
  action: DiscordControlAction,
): DiscordButtonComponent {
  const label = assertDiscordButtonLabelFits(
    resolveActionDisplay(action).label,
  );

  return {
    type: DISCORD_BUTTON_COMPONENT_TYPE,
    label,
    style: resolveButtonStyle(action),
    /**
     * Discord component wire key; internal interaction inputs normalize it to `customId`.
     */
    custom_id: createDiscordComponentCustomId(action, request.threadId),
  };
}

/**
 * Builds Discord action rows from a contextual action list.
 */
export function renderDiscordActionComponentRows(
  request: DiscordControlRequest,
  actions: readonly DiscordControlAction[],
): readonly DiscordActionRowComponent[] {
  const rows: DiscordActionRowComponent[] = [];
  let currentRow: DiscordButtonComponent[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    const button = createDiscordButton(request, action);
    if (button.custom_id !== undefined) {
      if (seen.has(button.custom_id)) {
        throw new Error(
          'Discord message components must have unique custom ids.',
        );
      }

      seen.add(button.custom_id);
    }

    currentRow.push(button);
    if (currentRow.length === 5) {
      rows.push({
        type: DISCORD_ACTION_ROW_COMPONENT_TYPE,
        components: currentRow,
      });
      currentRow = [];
    }
  }

  if (currentRow.length > 0) {
    rows.push({
      type: DISCORD_ACTION_ROW_COMPONENT_TYPE,
      components: currentRow,
    });
  }

  return rows;
}

/**
 * Creates a structured Discord payload from content and contextual controls.
 */
function createDiscordPayload(
  content: string,
  request: DiscordControlRequest,
  controls: readonly DiscordControlAction[],
): DiscordMessagePayload {
  return {
    content,
    /**
     * Discord message payload wire key; required to prevent accidental operator pings.
     */
    allowed_mentions: safeAllowedMentions,
    components: renderDiscordActionComponentRows(request, controls),
  };
}

/**
 * Renders the standard accepted-action message.
 */
export function renderDiscordControlAcceptedMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const display = resolveActionDisplay(request.action);
  const content = renderDiscordMessageContent({
    actionLabel: display.acceptedTitle,
    fields: {
      Status: 'accepted',
      Scope: renderDiscordScopeValue(request),
      Item: renderDiscordItemValue(request),
      Actor: describeActor(request.actorId),
    },
    indicator: display.acceptedIndicator,
    result: display.result,
  });

  return createDiscordPayload(
    content,
    request,
    resolveAcceptedControls(request, display),
  );
}

/**
 * Renders the standard policy-blocked action message.
 */
export function renderDiscordControlBlockedMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const content = renderDiscordMessageContent({
    actionLabel: 'Action blocked',
    fields: {
      Status: 'blocked',
      Action: request.action,
      Scope: renderDiscordScopeValue(request),
      Reason: 'policy denied this action',
    },
    indicator: '🔴',
    result: 'No platform state was changed beyond audit logging.',
  });

  return createDiscordPayload(content, request, blockedControls);
}

/**
 * Renders the standard route-failure message for ambiguous thread context.
 */
export function renderDiscordRouteFailureMessage(
  input: DiscordOperatorInteraction,
): DiscordMessagePayload {
  const request: DiscordControlRequest = {
    id: input.id,
    summary: 'interaction must resolve to exactly one bound thread',
    status: 'blocked',
    trace: [],
    updatedAt: input.updatedAt,
    actorId: input.actorId,
    threadId: 'unresolved',
    channelId: input.channelId,
    action: 'show-status',
    privileged: false,
  } satisfies DiscordControlRequest;
  const content = renderDiscordMessageContent({
    actionLabel: 'Action refused',
    fields: {
      Status: 'blocked',
      Scope: 'unresolved',
      Reason: 'interaction must resolve to exactly one bound thread',
    },
    indicator: '🔴',
    result: 'Run this from the correct spec, implementation, or PR thread.',
  });

  return createDiscordPayload(content, request, failureControls);
}

/**
 * Renders the standard status message.
 */
export function renderDiscordStatusMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const content = renderDiscordMessageContent({
    actionLabel: 'Status',
    fields: {
      Status: request.status,
      Scope: renderDiscordScopeValue(request),
      Item: renderDiscordItemValue(request),
      Updated: request.updatedAt,
    },
    indicator: 'ℹ️',
    result: request.summary,
  });

  return createDiscordPayload(content, request, [
    'run-this',
    'retry-gates',
    'show-last-artifact',
  ]);
}

/**
 * Renders the standard artifact message.
 */
export function renderDiscordArtifactMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const artifactId = request.workItem?.artifactId ?? request.id;
  const content = renderDiscordMessageContent({
    actionLabel: 'Last artifact',
    fields: {
      Status: 'available',
      Scope: renderDiscordScopeValue(request),
      Artifact: artifactId,
      Updated: request.updatedAt,
    },
    indicator: '📎',
    result: 'Latest artifact is attached, linked, or summarized below.',
  });

  return createDiscordPayload(content, request, [
    'show-last-artifact',
    'show-status',
    'explain-failure',
  ]);
}

/**
 * Renders the standard failure explanation message.
 */
export function renderDiscordFailureExplanationMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const content = renderDiscordMessageContent({
    actionLabel: 'Failure explanation',
    fields: {
      Status: 'failed or blocked',
      Scope: renderDiscordScopeValue(request),
      Item: renderDiscordItemValue(request),
      Reason: 'policy or gate failure requires operator review',
    },
    indicator: '🔴',
    result: 'Review details, then retry gates or remediate.',
  });

  return createDiscordPayload(content, request, [
    'retry-gates',
    'show-last-artifact',
  ]);
}

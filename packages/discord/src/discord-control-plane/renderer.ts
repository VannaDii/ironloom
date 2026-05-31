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

import {
  DISCORD_ACTION_ROW_COMPONENT_TYPE,
  DISCORD_BASE64URL_MARKER_PATTERN,
  DISCORD_BUTTON_COMPONENT_TYPE,
  DISCORD_BUTTON_LABEL_MAX_LENGTH,
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_BUTTON_STYLE_SUCCESS,
  DISCORD_COMPONENT_CUSTOM_ID_PREFIX,
  DISCORD_CUSTOM_ID_MAX_LENGTH,
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_MILLISECONDS_PER_SECOND,
  DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
  DISCORD_MESSAGE_CONTENT_TRUNCATED_MARKER,
  DISCORD_RESUME_PROJECT_FORCE_COMPONENT_ACTION_TOKEN,
  DISCORD_ROUTE_FAILURE_EVENT_LABEL,
  DISCORD_ROUTE_FAILURE_REDACTED_VALUE,
  DISCORD_ROUTE_FAILURE_TRUNCATED_MARKER,
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
} from './codec.js';

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
  [DEVPLAT_ACTION_NEW_PROJECT]: {
    label: 'New Project',
    acceptedTitle: 'Project bootstrap started',
    acceptedIndicator: '🟡',
    result: 'Project bootstrap is running with Discord-first controls.',
    controls: [DEVPLAT_ACTION_PROJECT_SUMMARY, DEVPLAT_ACTION_SHOW_STATUS],
  },
  [DEVPLAT_ACTION_OPEN_PROJECT]: {
    label: 'Open Project',
    acceptedTitle: 'Project opened',
    acceptedIndicator: '🟢',
    result: 'Project context restored with thread-bound routing.',
    controls: [DEVPLAT_ACTION_PROJECT_SUMMARY, DEVPLAT_ACTION_PHASE_CONTRACT],
  },
  [DEVPLAT_ACTION_PROJECT_SUMMARY]: {
    label: 'Project Summary',
    acceptedTitle: 'Project summary',
    acceptedIndicator: 'ℹ️',
    result: 'Project lifecycle summary is available.',
    controls: [DEVPLAT_ACTION_PHASE_CONTRACT, DEVPLAT_ACTION_SHOW_STATUS],
  },
  [DEVPLAT_ACTION_PROJECT_SETTINGS]: {
    label: 'Project Settings',
    acceptedTitle: 'Settings update requested',
    acceptedIndicator: '🟡',
    result: 'Project settings update is being applied.',
    controls: [
      DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
      DEVPLAT_ACTION_PROJECT_SUMMARY,
    ],
  },
  [DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY]: {
    label: 'Settings History',
    acceptedTitle: 'Settings history',
    acceptedIndicator: 'ℹ️',
    result: 'Append-only settings history is available.',
    controls: [DEVPLAT_ACTION_PROJECT_SUMMARY, DEVPLAT_ACTION_PHASE_CONTRACT],
  },
  [DEVPLAT_ACTION_CANCEL_PROJECT]: {
    label: 'Cancel Project',
    acceptedTitle: 'Project paused',
    acceptedIndicator: '🔴',
    result:
      'Project activity paused and cancellation summaries are posted. Next: review /show-last-artifact and /project-summary, then use /resume-project when ready.',
    controls: [
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
      DEVPLAT_ACTION_PROJECT_SUMMARY,
      DEVPLAT_ACTION_RESUME_PROJECT,
    ],
  },
  [DEVPLAT_ACTION_RESUME_PROJECT]: {
    label: 'Resume Project',
    acceptedTitle: 'Project resume requested',
    acceptedIndicator: '🟡',
    result:
      'Global preflight is running before project resume. If issues are detected, a second confirmation is required. Use /resume-project --force force to acknowledge and continue.',
    controls: [
      DEVPLAT_ACTION_RESUME_PROJECT,
      DEVPLAT_ACTION_PROJECT_SUMMARY,
      DEVPLAT_ACTION_SHOW_STATUS,
    ],
  },
  [DEVPLAT_ACTION_RELEASE_PROJECT]: {
    label: 'Release Project',
    acceptedTitle: 'Release requested',
    acceptedIndicator: '🟡',
    result: 'Release preconditions are being re-validated.',
    controls: [
      DEVPLAT_ACTION_RELEASE_PROJECT,
      DEVPLAT_ACTION_PROJECT_SUMMARY,
      DEVPLAT_ACTION_SHOW_STATUS,
    ],
  },
  [DEVPLAT_ACTION_PHASE_CONTRACT]: {
    label: 'Phase Contract',
    acceptedTitle: 'Phase contract',
    acceptedIndicator: 'ℹ️',
    result: 'Current phase command contract is shown.',
    controls: [DEVPLAT_ACTION_SHOW_STATUS, DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  },
  [DEVPLAT_ACTION_ALTERNATIVES]: {
    label: 'Alternatives',
    acceptedTitle: 'Alternatives requested',
    acceptedIndicator: '🟡',
    result:
      'Generating 3 alternatives with S/M/L effort, time ranges, and risk types: technical, product, security, dependency, operational.',
    controls: [DEVPLAT_ACTION_RESEARCH, DEVPLAT_ACTION_SPEC],
  },
  [DEVPLAT_ACTION_REDIRECT]: {
    label: 'Redirect',
    acceptedTitle: 'Direction updated',
    acceptedIndicator: '🟢',
    result: 'Research direction was replaced for future updates.',
    controls: [DEVPLAT_ACTION_RESEARCH, DEVPLAT_ACTION_ALTERNATIVES],
  },
  [DEVPLAT_ACTION_CONSIDER]: {
    label: 'Consider',
    acceptedTitle: 'Input queued',
    acceptedIndicator: '🟢',
    result: 'The link is queued for the next research update.',
    controls: [DEVPLAT_ACTION_RESEARCH, DEVPLAT_ACTION_ALTERNATIVES],
  },
  [DEVPLAT_ACTION_RESEARCH]: {
    label: 'Research',
    acceptedTitle: 'Research requested',
    acceptedIndicator: '🟡',
    result: 'Research is running for the current project context.',
    controls: [DEVPLAT_ACTION_ALTERNATIVES, DEVPLAT_ACTION_SPEC],
  },
  [DEVPLAT_ACTION_SPEC]: {
    label: 'Spec',
    acceptedTitle: 'Spec requested',
    acceptedIndicator: '🟡',
    result: 'Preparing spec summary and approval checkpoint.',
    controls: [
      DEVPLAT_ACTION_APPROVE_THIS,
      DEVPLAT_ACTION_RESEARCH,
      DEVPLAT_ACTION_ALTERNATIVES,
      DEVPLAT_ACTION_SHOW_STATUS,
    ],
  },
  [DEVPLAT_ACTION_APPROVE_THIS]: {
    label: 'Approve',
    acceptedTitle: 'Approval recorded',
    acceptedIndicator: '🟢',
    result: 'Approved. Ready for the next lifecycle step.',
    controls: [
      DEVPLAT_ACTION_RUN_THIS,
      DEVPLAT_ACTION_MERGE_NOW,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_BLOCK_THIS]: {
    label: 'Block',
    acceptedTitle: 'Work blocked',
    acceptedIndicator: '🔴',
    result: 'Blocked. Automation is paused for this thread.',
    controls: [
      DEVPLAT_ACTION_EXPLAIN_FAILURE,
      DEVPLAT_ACTION_RESUME_THIS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_CLAIM_THIS]: {
    label: 'Claim',
    acceptedTitle: 'Work claimed',
    acceptedIndicator: '🟢',
    result: 'This thread is now claimed for delivery.',
    controls: [
      DEVPLAT_ACTION_RUN_THIS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
      DEVPLAT_ACTION_SHOW_STATUS,
    ],
  },
  [DEVPLAT_ACTION_COMPLETE_THIS]: {
    label: 'Complete',
    acceptedTitle: 'Work complete',
    acceptedIndicator: '🟢',
    result: 'Completed. Waiting for supervisor routing.',
    controls: [
      DEVPLAT_ACTION_RUN_THIS,
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_EXPLAIN_FAILURE]: {
    label: 'Explain Failure',
    acceptedTitle: 'Failure explanation',
    acceptedIndicator: '🔴',
    result: 'Review the latest failure and choose the next action.',
    controls: [DEVPLAT_ACTION_RETRY_GATES, DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  },
  [DEVPLAT_ACTION_MERGE_NOW]: {
    label: 'Merge',
    acceptedTitle: 'Merge requested',
    acceptedIndicator: '🟡',
    result: 'Merge request accepted. Policy and gates will be checked first.',
    controls: [
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_PAUSE_THIS]: {
    label: 'Pause',
    acceptedTitle: 'Automation paused',
    acceptedIndicator: '⏸️',
    result: 'Automation paused for this thread only.',
    controls: [
      DEVPLAT_ACTION_RESUME_THIS,
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS]: {
    label: 'Rebase Dependents',
    acceptedTitle: 'Rebase requested',
    acceptedIndicator: '🟡',
    result: 'Rebase requested for dependent branches.',
    controls: [
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_EXPLAIN_FAILURE,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_RELEASE_WORKTREE]: {
    label: 'Release Worktree',
    acceptedTitle: 'Worktree release requested',
    acceptedIndicator: '🟢',
    result: 'Releasing the bound worktree if policy allows.',
    controls: [DEVPLAT_ACTION_SHOW_STATUS, DEVPLAT_ACTION_SHOW_LAST_ARTIFACT],
  },
  [DEVPLAT_ACTION_RESUME_THIS]: {
    label: 'Resume',
    acceptedTitle: 'Automation resumed',
    acceptedIndicator: '▶️',
    result: 'Automation may continue in this thread.',
    controls: [
      DEVPLAT_ACTION_RUN_THIS,
      DEVPLAT_ACTION_PAUSE_THIS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_RETRY_GATES]: {
    label: 'Retry Gates',
    acceptedTitle: 'Gates retry queued',
    acceptedIndicator: '🟡',
    result: 'Re-running quality gates for this work item.',
    controls: [
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_EXPLAIN_FAILURE,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_RUN_THIS]: {
    label: 'Run',
    acceptedTitle: 'Run requested',
    acceptedIndicator: '🟡',
    result: 'Starting the bound work item.',
    controls: [
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_PAUSE_THIS,
    ],
  },
  [DEVPLAT_ACTION_SHOW_LAST_ARTIFACT]: {
    label: 'Details',
    acceptedTitle: 'Last artifact',
    acceptedIndicator: '📎',
    result: 'Latest artifact is attached, linked, or summarized below.',
    controls: [
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_EXPLAIN_FAILURE,
    ],
  },
  [DEVPLAT_ACTION_SHOW_STATUS]: {
    label: 'Show Status',
    acceptedTitle: 'Status',
    acceptedIndicator: 'ℹ️',
    result: 'Current lifecycle status is available.',
    controls: [
      DEVPLAT_ACTION_RUN_THIS,
      DEVPLAT_ACTION_RETRY_GATES,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_SYNC_WORKTREE]: {
    label: 'Sync Worktree',
    acceptedTitle: 'Worktree sync queued',
    acceptedIndicator: '🟡',
    result: 'Synchronizing the bound worktree.',
    controls: [
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_RELEASE_WORKTREE,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
  [DEVPLAT_ACTION_UPDATE_SPEC]: {
    label: 'Update Spec',
    acceptedTitle: 'Spec update requested',
    acceptedIndicator: '🟡',
    result: 'Updating the bound spec from this thread context.',
    controls: [
      DEVPLAT_ACTION_SHOW_STATUS,
      DEVPLAT_ACTION_APPROVE_THIS,
      DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    ],
  },
};

/**
 * Default controls for route failures and policy-denied messages.
 */
const failureControls: readonly DiscordControlAction[] = [
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
];

/**
 * Default controls for policy-denied actions.
 */
const blockedControls: readonly DiscordControlAction[] = [
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
];

/**
 * Full command surface shown in `/show-status` next-actions output.
 */
const showStatusCommandSurface: readonly DiscordControlAction[] = [
  DEVPLAT_ACTION_NEW_PROJECT,
  DEVPLAT_ACTION_OPEN_PROJECT,
  DEVPLAT_ACTION_PROJECT_SUMMARY,
  DEVPLAT_ACTION_PROJECT_SETTINGS,
  DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY,
  DEVPLAT_ACTION_CANCEL_PROJECT,
  DEVPLAT_ACTION_RESUME_PROJECT,
  DEVPLAT_ACTION_RELEASE_PROJECT,
  DEVPLAT_ACTION_PHASE_CONTRACT,
  DEVPLAT_ACTION_RESEARCH,
  DEVPLAT_ACTION_SPEC,
  DEVPLAT_ACTION_APPROVE_THIS,
  DEVPLAT_ACTION_REDIRECT,
  DEVPLAT_ACTION_CONSIDER,
  DEVPLAT_ACTION_ALTERNATIVES,
  DEVPLAT_ACTION_RUN_THIS,
  DEVPLAT_ACTION_CLAIM_THIS,
  DEVPLAT_ACTION_COMPLETE_THIS,
  DEVPLAT_ACTION_BLOCK_THIS,
  DEVPLAT_ACTION_PAUSE_THIS,
  DEVPLAT_ACTION_RESUME_THIS,
  DEVPLAT_ACTION_RETRY_GATES,
  DEVPLAT_ACTION_MERGE_NOW,
  DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS,
  DEVPLAT_ACTION_SYNC_WORKTREE,
  DEVPLAT_ACTION_RELEASE_WORKTREE,
  DEVPLAT_ACTION_SHOW_STATUS,
  DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  DEVPLAT_ACTION_EXPLAIN_FAILURE,
  DEVPLAT_ACTION_UPDATE_SPEC,
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
 * Formats an absolute UTC timestamp as a Discord relative-time display tag.
 */
function formatDiscordRelativeTimeTag(value: string): string {
  const timestampMilliseconds = Date.parse(value);
  if (Number.isNaN(timestampMilliseconds)) {
    return value;
  }

  return `<t:${String(
    Math.floor(timestampMilliseconds / DISCORD_MILLISECONDS_PER_SECOND),
  )}:R>`;
}

/**
 * Builds the canonical DevPlat Discord message body.
 */
function renderDiscordMessageContent(
  input: DiscordMessageContentInput,
): string {
  const content = [
    `${input.indicator} DevPlat · ${input.actionLabel}`,
    '',
    ...Object.entries(input.fields).map(
      ([fieldName, fieldValue]) => `${fieldName}: ${fieldValue}`,
    ),
    `→ ${input.result}`,
  ].join('\n');

  if (content.length <= DISCORD_MESSAGE_CONTENT_MAX_LENGTH) {
    return content;
  }

  const maxBodyLength =
    DISCORD_MESSAGE_CONTENT_MAX_LENGTH -
    DISCORD_MESSAGE_CONTENT_TRUNCATED_MARKER.length -
    1;
  const boundedBody = content.slice(0, Math.max(0, maxBodyLength)).trimEnd();
  return `${boundedBody}\n${DISCORD_MESSAGE_CONTENT_TRUNCATED_MARKER}`;
}

/**
 * Returns true when a normalized sensitive-key character should be retained.
 */
function isDiscordEventFieldNameCharacter(character: string): boolean {
  return (
    (character >= 'a' && character <= 'z') ||
    (character >= '0' && character <= '9')
  );
}

/**
 * Normalizes a Discord event field name for sensitive-key detection.
 */
function normalizeDiscordEventFieldName(fieldName: string): string {
  return Array.from(fieldName.toLowerCase())
    .filter((character) => isDiscordEventFieldNameCharacter(character))
    .join('');
}

/**
 * Returns true when a Discord event field should not be echoed to operators.
 */
function isSensitiveDiscordEventField(fieldName: string): boolean {
  const normalized = normalizeDiscordEventFieldName(fieldName);
  return (
    normalized === 'token' ||
    normalized === 'authorization' ||
    normalized === 'signature' ||
    normalized === 'roles' ||
    normalized === 'actorroleids' ||
    normalized === 'publickey' ||
    normalized === 'privatekey' ||
    normalized.endsWith('roleid') ||
    normalized.endsWith('roleids') ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('apikey')
  );
}

/**
 * Redacts sensitive fields from the received Discord event diagnostic.
 */
function redactDiscordEventDiagnostic(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((item) => redactDiscordEventDiagnostic(item));
  }

  if (input !== null && typeof input === 'object') {
    const redacted: Record<string, unknown> = {};
    for (const [fieldName, fieldValue] of Object.entries(input)) {
      redacted[fieldName] = isSensitiveDiscordEventField(fieldName)
        ? DISCORD_ROUTE_FAILURE_REDACTED_VALUE
        : redactDiscordEventDiagnostic(fieldValue);
    }

    return redacted;
  }

  return input;
}

/**
 * Truncates a JSON diagnostic while preserving an explicit operator marker.
 */
function truncateDiscordDiagnosticJson(
  value: string,
  maximumLength: number,
): string {
  const boundedMaximumLength = Math.max(0, maximumLength);
  if (value.length <= boundedMaximumLength) {
    return value;
  }

  const marker = `\n${DISCORD_ROUTE_FAILURE_TRUNCATED_MARKER}`;
  const retainedLength = Math.max(0, boundedMaximumLength - marker.length);
  return `${value.slice(0, retainedLength)}${marker}`.slice(
    0,
    boundedMaximumLength,
  );
}

/**
 * Wraps a JSON diagnostic in a fenced block that fits the available content.
 */
function createDiscordReceivedEventDiagnostic(
  jsonText: string,
  maximumLength: number,
): string {
  const prefix = `${DISCORD_ROUTE_FAILURE_EVENT_LABEL}\n\`\`\`json\n`;
  const suffix = '\n```';
  const boundedMaximumLength = Math.max(0, maximumLength);
  const availableJsonLength = Math.max(
    0,
    boundedMaximumLength - prefix.length - suffix.length,
  );

  return `${prefix}${truncateDiscordDiagnosticJson(
    jsonText,
    availableJsonLength,
  )}${suffix}`.slice(0, boundedMaximumLength);
}

/**
 * Renders the received Discord event as a fenced JSON diagnostic.
 */
function renderDiscordReceivedEventDiagnostic(
  input: DiscordOperatorInteraction,
  maximumLength: number,
): string {
  const receivedEvent =
    input.receivedEvent === undefined ? input : input.receivedEvent;
  try {
    return createDiscordReceivedEventDiagnostic(
      JSON.stringify(redactDiscordEventDiagnostic(receivedEvent), null, 2),
      maximumLength,
    );
  } catch (error) {
    return createDiscordReceivedEventDiagnostic(
      JSON.stringify({
        error: error instanceof Error ? error.message : String(error),
      }),
      maximumLength,
    );
  }
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
 * Extracts summary metadata markers used by project status surfaces.
 */
function resolveSummaryMetadata(summary: string): {
  readonly runIntent?: string;
  readonly configVersion?: string;
  readonly phase?: string;
} {
  const runIntent = resolveSummaryMarkerValue(summary, '(intent:');
  const configVersion = resolveSummaryMarkerValue(summary, '(config-version:');
  const phase = resolveSummaryMarkerValue(summary, '(phase:');

  return {
    ...(runIntent === undefined || runIntent.length === 0 ? {} : { runIntent }),
    ...(configVersion === undefined || configVersion.length === 0
      ? {}
      : { configVersion }),
    ...(phase === undefined || phase.length === 0 ? {} : { phase }),
  };
}

/**
 * Resolves one parenthesized summary metadata marker with deterministic scanning.
 */
function resolveSummaryMarkerValue(
  summary: string,
  markerPrefix: string,
): string | undefined {
  const markerStart = summary.lastIndexOf(markerPrefix);

  if (markerStart < 0) {
    return undefined;
  }

  const valueStart = markerStart + markerPrefix.length;
  const valueEnd = summary.indexOf(')', valueStart);

  if (valueEnd < 0) {
    return undefined;
  }

  const value = summary.slice(valueStart, valueEnd).trim();
  return value.length === 0 ? undefined : value;
}

/**
 * Infers release-precondition status when explicit prerequisite markers are unavailable.
 */
function resolveReleasePrerequisitesValue(
  releasePrerequisites: string | undefined,
  blockedStatus: string,
  pendingApprovals: string,
): string {
  if (releasePrerequisites !== undefined) {
    return sortReleasePrerequisitesByCriticalPath(releasePrerequisites);
  }
  const pendingApprovalsCount = Number.parseInt(pendingApprovals, 10);
  if (Number.isFinite(pendingApprovalsCount) && pendingApprovalsCount > 0) {
    return 'pending-approvals';
  }
  if (blockedStatus !== 'unblocked') {
    return 'blocked-threads';
  }
  return 'unknown';
}

/**
 * Sorts explicit release prerequisites by critical-path impact.
 */
function sortReleasePrerequisitesByCriticalPath(value: string): string {
  const parts = value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return value;
  }

  const sorted = [...parts].sort((left, right) => {
    const rankDelta =
      resolveReleasePrerequisiteRank(left) -
      resolveReleasePrerequisiteRank(right);
    if (rankDelta !== 0) {
      return rankDelta;
    }
    return left.localeCompare(right);
  });

  return sorted.join('|');
}

/**
 * Ranks one release prerequisite by critical-path impact.
 */
function resolveReleasePrerequisiteRank(prerequisite: string): number {
  const normalized = prerequisite.toLowerCase();
  if (
    normalized.includes('blocked-thread') ||
    normalized.includes('blocked-threads')
  ) {
    return 0;
  }
  if (
    normalized.includes('required-slice') ||
    normalized.includes('slice-merge') ||
    normalized.includes('required-slices')
  ) {
    return 1;
  }
  if (
    normalized.includes('gate-fail') ||
    normalized.includes('failed-gate') ||
    normalized.includes('missing-gate') ||
    normalized.includes('gates-pass')
  ) {
    return 2;
  }
  if (
    normalized.includes('pending-approval') ||
    normalized.includes('merge-approval')
  ) {
    return 3;
  }
  if (normalized.includes('settings') || normalized.includes('approval-mode')) {
    return 4;
  }
  return 10;
}

/**
 * Decodes base64url summary marker values when present.
 */
function resolveDecodedSummaryMarkerValue(
  summary: string,
  markerPrefix: string,
): string | undefined {
  const encoded = resolveSummaryMarkerValue(summary, markerPrefix);
  if (encoded === undefined || encoded.length === 0) {
    return undefined;
  }
  if (!DISCORD_BASE64URL_MARKER_PATTERN.test(encoded)) {
    return undefined;
  }
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8').trim();
  return decoded.length === 0 ? undefined : decoded;
}

/**
 * Returns additional fields for status and project summary messages.
 */
function resolveStatusSummaryMetadataFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (
    request.action !== DEVPLAT_ACTION_SHOW_STATUS &&
    request.action !== DEVPLAT_ACTION_PROJECT_SUMMARY
  ) {
    return {};
  }

  const metadata = resolveSummaryMetadata(request.summary);
  const repo =
    resolveSummaryMarkerValue(request.summary, '(repo:') ?? 'unknown';
  const project =
    resolveSummaryMarkerValue(request.summary, '(project:') ?? 'unknown';
  const phase = metadata.phase ?? 'unknown';
  const threadKind = request.workItem?.threadKind ?? 'thread';

  return {
    Identity: `repo:${repo} · project:${project} · phase:${phase} · thread-kind:${threadKind}`,
    ...(metadata.runIntent === undefined
      ? {}
      : { 'Run intent': metadata.runIntent }),
    ...(metadata.configVersion === undefined
      ? {}
      : { 'Config version': metadata.configVersion }),
    ...(metadata.phase === undefined ? {} : { Phase: metadata.phase }),
  };
}

/**
 * Builds strict full-status sections in required order for `/show-status`.
 */
function resolveShowStatusOrderedFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_SHOW_STATUS) {
    return {};
  }

  const metadata = resolveSummaryMetadata(request.summary);
  const identity =
    `repo:${resolveSummaryMarkerValue(request.summary, '(repo:') ?? 'unknown'} · ` +
    `project:${resolveSummaryMarkerValue(request.summary, '(project:') ?? 'unknown'} · ` +
    `phase:${metadata.phase ?? 'unknown'} · ` +
    `thread-kind:${request.workItem?.threadKind ?? 'thread'}`;
  const pendingApprovals =
    resolveSummaryMarkerValue(request.summary, '(pending-approvals:') ?? '0';
  const blockers =
    resolveSummaryMarkerValue(request.summary, '(blocked-status:') ?? 'none';
  const links = [
    `spec-pr:${resolveSummaryMarkerValue(request.summary, '(spec-pr:') ?? 'none'}`,
    `active-slice-pr:${resolveSummaryMarkerValue(request.summary, '(active-slice-pr:') ?? 'none'}`,
    `merged-pr-links:${resolveSummaryMarkerValue(request.summary, '(merged-pr-links:') ?? 'none'}`,
    `latest-artifact:${resolveSummaryMarkerValue(request.summary, '(artifact-links:') ?? 'none'}`,
    `workflow-run:${resolveSummaryMarkerValue(request.summary, '(workflow-run:') ?? 'none'}`,
    `published-assets:${resolveSummaryMarkerValue(request.summary, '(asset-links:') ?? 'none'}`,
  ].join(' | ');
  const availableActions = resolveAcceptedControls(
    request,
    resolveActionDisplay(request.action),
  );
  const nextActions = showStatusCommandSurface
    .map((action) => {
      if (availableActions.includes(action)) {
        return `/${action} [available]`;
      }
      const requiredRole = resolveRequiredRoleLabel({
        ...request,
        action,
      });
      return requiredRole === undefined
        ? `/${action} [locked]`
        : `/${action} [locked:${requiredRole}]`;
    })
    .join(' | ');

  return {
    Identity: identity,
    Phase: metadata.phase ?? 'unknown',
    'Current action': `${request.action} · ${renderDiscordItemValue(request)}`,
    Blockers: blockers,
    Approvals: pendingApprovals,
    ...(metadata.runIntent === undefined
      ? {}
      : { 'Run intent': metadata.runIntent }),
    ...(metadata.configVersion === undefined
      ? {}
      : { 'Config version': metadata.configVersion }),
    Links: links,
    'Next actions': nextActions,
  };
}

/**
 * Parses resume-project preflight markers from summary metadata.
 */
function resolveResumeProjectPreflightFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_RESUME_PROJECT) {
    return {};
  }

  const markerPrefix = '(preflight:';
  const markerStart = request.summary.lastIndexOf(markerPrefix);
  if (markerStart < 0) {
    return {};
  }

  const markerValueStart = markerStart + markerPrefix.length;
  const markerValueEnd = request.summary.indexOf(')', markerValueStart);
  if (markerValueEnd < 0) {
    return {};
  }

  const markerValue = request.summary.slice(markerValueStart, markerValueEnd);
  const tokens = markerValue
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  const mode = tokens.find((token) => !token.includes(':'));
  const issuesToken = tokens.find((token) => token.startsWith('issues:'));
  const issues =
    issuesToken === undefined ? undefined : issuesToken.slice('issues:'.length);
  const checksTokens = tokens.filter(
    (token) => token.includes(':') && !token.startsWith('issues:'),
  );
  const checks =
    checksTokens.length === 0 ? undefined : checksTokens.join(', ');

  const notifyRoles =
    mode === 'forced' && issues !== undefined && issues !== 'none'
      ? 'spec-approver | merge-approver'
      : undefined;
  const checkpointId = resolveSummaryMarkerValue(
    request.summary,
    '(checkpoint-id:',
  );
  const checkpointAt = resolveSummaryMarkerValue(
    request.summary,
    '(checkpoint-at:',
  );

  return {
    ...(mode === undefined ? {} : { Preflight: mode }),
    ...(checks === undefined ? {} : { Checks: checks }),
    ...(issues === undefined ? {} : { Issues: issues }),
    ...(notifyRoles === undefined ? {} : { 'Notify roles': notifyRoles }),
    ...(checkpointId === undefined ? {} : { 'Checkpoint ID': checkpointId }),
    ...(checkpointAt === undefined
      ? {}
      : { 'Checkpoint at': formatDiscordRelativeTimeTag(checkpointAt) }),
  };
}

/**
 * Returns metadata fields for artifact responses.
 */
function resolveArtifactMetadataFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  const metadata = resolveSummaryMetadata(request.summary);
  return {
    ...(metadata.runIntent === undefined
      ? {}
      : { 'Run intent': metadata.runIntent }),
    ...(metadata.configVersion === undefined
      ? {}
      : { 'Config version': metadata.configVersion }),
  };
}

/**
 * Builds one-line interpretation text for artifact relevance.
 */
function resolveArtifactInterpretation(request: DiscordControlRequest): string {
  const metadata = resolveSummaryMetadata(request.summary);
  const context =
    metadata.runIntent === undefined
      ? 'current lifecycle context'
      : `${metadata.runIntent} run context`;

  return `Why this matters now: this artifact is the latest evidence for ${context}.`;
}

/**
 * Returns canonical release-summary fields for release-project confirmations.
 */
function resolveReleaseSummaryFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_RELEASE_PROJECT) {
    return {};
  }

  const repo = resolveSummaryMarkerValue(request.summary, '(repo:');
  const branch = resolveSummaryMarkerValue(request.summary, '(branch:');
  const mergedPullRequestLinks = resolveSummaryMarkerValue(
    request.summary,
    '(merged-pr-links:',
  );
  const specLink = resolveSummaryMarkerValue(request.summary, '(spec-link:');
  const sliceListStatus = resolveSummaryMarkerValue(
    request.summary,
    '(slice-list-status:',
  );
  const gateResults = resolveSummaryMarkerValue(
    request.summary,
    '(gate-results:',
  );
  const healthMetrics = resolveSummaryMarkerValue(
    request.summary,
    '(health-metrics:',
  );
  const unresolvedRisks = resolveSummaryMarkerValue(
    request.summary,
    '(unresolved-risks:',
  );
  const followUpRecommendations = resolveSummaryMarkerValue(
    request.summary,
    '(follow-up-recommendations:',
  );
  const assetLinks = resolveSummaryMarkerValue(
    request.summary,
    '(asset-links:',
  );
  const blockerIncidents = resolveSummaryMarkerValue(
    request.summary,
    '(blocker-incidents:',
  );
  const stallIncidents = resolveSummaryMarkerValue(
    request.summary,
    '(stall-incidents:',
  );
  const contractDegradationIncidents = resolveSummaryMarkerValue(
    request.summary,
    '(contract-degradation-incidents:',
  );
  const incidentLinks = resolveSummaryMarkerValue(
    request.summary,
    '(incident-links:',
  );
  const roleVisibility =
    resolveSummaryMarkerValue(request.summary, '(visibility:') === 'role';

  return {
    Repo: repo ?? 'unknown',
    Branch: branch ?? 'unknown',
    'Merged PR links': mergedPullRequestLinks ?? 'none recorded',
    'Spec link': specLink ?? 'unavailable',
    'Slice list/status': sliceListStatus ?? 'unavailable',
    'Gate results': gateResults ?? 'unavailable',
    'Operational health': healthMetrics ?? 'pending incident aggregation',
    'Unresolved risks': unresolvedRisks ?? 'none reported',
    'Follow-up recommendations': followUpRecommendations ?? 'none',
    'Asset links': assetLinks ?? 'none published',
    'Blocker incidents':
      blockerIncidents ?? 'current-run:unknown lifetime:unknown',
    'Stall incidents': stallIncidents ?? 'current-run:unknown lifetime:unknown',
    'Contract degradation incidents':
      contractDegradationIncidents ?? 'current-run:unknown lifetime:unknown',
    'Incident links':
      roleVisibility && incidentLinks !== undefined
        ? incidentLinks
        : 'restricted/unavailable',
  };
}

/**
 * Returns dashboard snapshot fields for `/open-project` confirmations.
 */
function resolveOpenProjectDashboardFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_OPEN_PROJECT) {
    return {};
  }

  const phase = resolveSummaryMarkerValue(request.summary, '(phase:');
  const blockers = resolveSummaryMarkerValue(request.summary, '(blockers:');
  const activeSlices = resolveSummaryMarkerValue(
    request.summary,
    '(active-slices:',
  );
  const pendingApprovals = resolveSummaryMarkerValue(
    request.summary,
    '(pending-approvals:',
  );
  const keyLinks = resolveSummaryMarkerValue(request.summary, '(key-links:');

  return {
    Phase: phase ?? 'unknown',
    Blockers: blockers ?? 'unknown',
    'Active slices': activeSlices ?? 'unknown',
    'Pending approvals': pendingApprovals ?? '0',
    'Key links': keyLinks ?? 'unavailable',
  };
}

/**
 * Returns visibility-tiered fields for `/project-summary`.
 */
function resolveProjectSummaryVisibilityFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_PROJECT_SUMMARY) {
    return {};
  }

  const repo = resolveSummaryMarkerValue(request.summary, '(repo:');
  const project = resolveSummaryMarkerValue(request.summary, '(project:');
  const phase =
    resolveSummaryMarkerValue(request.summary, '(phase:') ?? 'unknown';
  const phaseStatus =
    resolveSummaryMarkerValue(request.summary, '(phase-status:') ?? 'unknown';
  const blockedStatus =
    resolveSummaryMarkerValue(request.summary, '(blocked-status:') ?? 'unknown';
  const pendingApprovals =
    resolveSummaryMarkerValue(request.summary, '(pending-approvals:') ?? '0';
  const phaseFilter =
    resolveSummaryMarkerValue(request.summary, '(phase-filter:') ?? 'all';
  const eta = resolveSummaryMarkerValue(request.summary, '(eta:');
  const artifactLinks = resolveSummaryMarkerValue(
    request.summary,
    '(artifact-links:',
  );
  const releasePrerequisites = resolveSummaryMarkerValue(
    request.summary,
    '(release-prerequisites:',
  );
  const releasePrerequisiteLinks = resolveSummaryMarkerValue(
    request.summary,
    '(release-prerequisite-links:',
  );
  const releasePrerequisiteRoles = resolveSummaryMarkerValue(
    request.summary,
    '(release-prerequisite-roles:',
  );
  const possibleCommands = resolveSummaryMarkerValue(
    request.summary,
    '(possible-commands:',
  );
  const degradationNotes = resolveSummaryMarkerValue(
    request.summary,
    '(degradation-notes:',
  );
  const continuationCounter = resolveSummaryMarkerValue(
    request.summary,
    '(continuation-counter:',
  );
  const continuationLastEvent = resolveSummaryMarkerValue(
    request.summary,
    '(continuation-last-event:',
  );
  const roleVisibility = resolveSummaryMarkerValue(
    request.summary,
    '(visibility:',
  );

  if (roleVisibility !== 'role') {
    const resolvedReleasePrerequisites = resolveReleasePrerequisitesValue(
      releasePrerequisites,
      blockedStatus,
      pendingApprovals,
    );
    return {
      Repo: repo ?? 'unknown',
      Project: project ?? 'unknown',
      Phase: phase,
      'Phase status': phaseStatus,
      'Blocked status': blockedStatus,
      'Pending approvals': pendingApprovals,
      View: `${phaseFilter} phases (condensed)`,
      'Phase filter commands':
        '/project-summary --phase all|spec|slicing|implementation|pr|release',
      'Phase filter examples':
        '/project-summary --phase spec | /project-summary --phase pr | /project-summary --phase release',
      'Artifact links': 'restricted/unavailable',
      'Release prerequisites': resolvedReleasePrerequisites,
      'Release prerequisite links':
        releasePrerequisiteLinks ?? 'restricted/unavailable',
      'Release unblock roles':
        releasePrerequisiteRoles ?? 'restricted/unavailable',
      'Possible commands':
        possibleCommands ??
        '/project-summary [available] | /phase-contract [available] | /release-project [locked:project-operator|merge-approver]',
      'Degradation notes': degradationNotes ?? 'none reported',
      'Continuation counter': continuationCounter ?? '0',
      'Last continuation event': continuationLastEvent ?? 'none recorded',
    };
  }

  const strictness =
    resolveSummaryMarkerValue(request.summary, '(quality-strictness:') ??
    'unknown';
  const approvalMode =
    resolveSummaryMarkerValue(request.summary, '(approval-mode:') ?? 'unknown';
  const configVersion =
    resolveSummaryMarkerValue(request.summary, '(config-version:') ?? 'unknown';
  const resolvedReleasePrerequisites = resolveReleasePrerequisitesValue(
    releasePrerequisites,
    blockedStatus,
    pendingApprovals,
  );
  const approvalModeImpact = resolveSummaryMarkerValue(
    request.summary,
    '(approval-mode-impact:',
  );
  const auditArtifactLinks = resolveSummaryMarkerValue(
    request.summary,
    '(audit-artifact-links:',
  );

  return {
    Repo: repo ?? 'unknown',
    Project: project ?? 'unknown',
    Phase: phase,
    'Phase status': phaseStatus,
    'Blocked status': blockedStatus,
    'Pending approvals': pendingApprovals,
    View: `${phaseFilter} phases (condensed)`,
    'Phase filter commands':
      '/project-summary --phase all|spec|slicing|implementation|pr|release',
    'Phase filter examples':
      '/project-summary --phase spec | /project-summary --phase pr | /project-summary --phase release',
    ...(eta === undefined ? {} : { ETA: eta }),
    'Artifact links': artifactLinks ?? 'none',
    'Config version': configVersion,
    'Quality strictness': strictness,
    'Approval mode': approvalMode,
    'Approval-mode impact': approvalModeImpact ?? 'unknown',
    'Audit artifact links': auditArtifactLinks ?? 'unavailable',
    'Release prerequisites': resolvedReleasePrerequisites,
    'Release prerequisite links': releasePrerequisiteLinks ?? 'unavailable',
    'Release unblock roles': releasePrerequisiteRoles ?? 'unavailable',
    'Possible commands':
      possibleCommands ??
      '/project-summary [available] | /phase-contract [available] | /release-project [locked:project-operator|merge-approver]',
    'Degradation notes': degradationNotes ?? 'none reported',
    'Continuation counter': continuationCounter ?? '0',
    'Last continuation event': continuationLastEvent ?? 'none recorded',
  };
}

/**
 * Returns discovery-control metadata fields for redirect/consider/research.
 */
function resolveDiscoveryControlFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action === DEVPLAT_ACTION_REDIRECT) {
    const direction =
      request.redirectPrompt ??
      resolveSummaryMarkerValue(request.summary, '(direction-prompt:');
    const previousDirection = resolveSummaryMarkerValue(
      request.summary,
      '(previous-direction:',
    );
    return {
      Direction: direction ?? 'unavailable',
      ...(previousDirection === undefined
        ? {}
        : { 'Previous direction': previousDirection }),
    };
  }

  if (request.action === DEVPLAT_ACTION_CONSIDER) {
    const url =
      request.considerUrl ??
      resolveDecodedSummaryMarkerValue(request.summary, '(url64:') ??
      resolveSummaryMarkerValue(request.summary, '(url:');
    const queuedCount = resolveSummaryMarkerValue(
      request.summary,
      '(queued-count:',
    );
    return {
      URL: url ?? 'unavailable',
      'Queued items': queuedCount ?? 'unknown',
    };
  }

  if (request.action === DEVPLAT_ACTION_RESEARCH) {
    const consideredUrls = resolveSummaryMarkerValue(
      request.summary,
      '(considered-urls:',
    );
    const staleSpecApproval = resolveSummaryMarkerValue(
      request.summary,
      '(stale-spec-approval:',
    );
    return {
      ...(consideredUrls === undefined
        ? {}
        : {
            'Queued URLs used': consideredUrls,
          }),
      ...(staleSpecApproval === undefined
        ? {}
        : {
            'Prior spec approval checkpoint': staleSpecApproval,
            'Approval fallback': '/approve-this',
          }),
    };
  }

  return {};
}

/**
 * Returns canonical alternatives fields with exactly three options.
 */
function resolveAlternativesFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_ALTERNATIVES) {
    return {};
  }

  const alternativeOne = resolveSummaryMarkerValue(request.summary, '(alt-1:');
  const alternativeTwo = resolveSummaryMarkerValue(request.summary, '(alt-2:');
  const alternativeThree = resolveSummaryMarkerValue(
    request.summary,
    '(alt-3:',
  );

  return {
    'Alternative 1':
      alternativeOne ??
      'Plan: Stabilize current architecture first · Effort: S (1-2 days) · Risk: Low [technical, dependency]',
    'Alternative 2':
      alternativeTwo ??
      'Plan: Deliver balanced feature increment · Effort: M (3-5 days) · Risk: Medium [product, operational]',
    'Alternative 3':
      alternativeThree ??
      'Plan: Expand for long-term scalability · Effort: L (1-2 weeks) · Risk: High [security, technical, dependency]',
  };
}

/**
 * Returns settings-history fields with public-summary redaction defaults.
 */
function resolveProjectSettingsHistoryFields(
  request: DiscordControlRequest,
): Readonly<Record<string, string>> {
  if (request.action !== DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY) {
    return {};
  }

  const mode =
    resolveSummaryMarkerValue(request.summary, '(mode:')?.toLowerCase() ??
    'summary';
  const changedAt = resolveSummaryMarkerValue(request.summary, '(changed-at:');
  const changedBy = resolveSummaryMarkerValue(request.summary, '(changed-by:');
  const changedKeys = resolveSummaryMarkerValue(
    request.summary,
    '(changed-keys:',
  );
  const effectiveValues = resolveSummaryMarkerValue(
    request.summary,
    '(effective-values:',
  );

  if (mode === 'detailed') {
    return {
      Mode: 'detailed',
      Visibility: 'project-operator only',
      'Changed at': changedAt ?? 'unknown',
      'Changed by': changedBy ?? 'unknown',
      'Changed keys': changedKeys ?? 'unknown',
      'Effective values': effectiveValues ?? 'see detailed artifact',
    };
  }

  return {
    Mode: 'summary',
    Visibility: 'all participants',
    Timestamp: changedAt ?? 'unavailable',
    Actor: changedBy ?? 'unavailable',
    'Changed setting keys': changedKeys ?? 'unavailable',
    'New effective values': effectiveValues ?? 'sensitive values redacted',
  };
}

/**
 * Renders compact project/thread context for blocked action diagnostics.
 */
function renderBlockedActionContextValue(
  request: DiscordControlRequest,
): string {
  if (request.workItem === undefined) {
    return request.threadId;
  }

  if (request.workItem.threadKind === 'implementation') {
    return request.workItem.sliceId === undefined
      ? `thread:${request.workItem.threadId}`
      : `slice:${request.workItem.sliceId} thread:${request.workItem.threadId}`;
  }

  if (request.workItem.threadKind === 'pull-request') {
    return request.workItem.pullRequestNumber === undefined
      ? `thread:${request.workItem.threadId}`
      : `pr:#${String(request.workItem.pullRequestNumber)} thread:${request.workItem.threadId}`;
  }

  return request.workItem.specId === undefined
    ? `thread:${request.workItem.threadId}`
    : `spec:${request.workItem.specId} thread:${request.workItem.threadId}`;
}

/**
 * Resolves the role label required for a blocked action in this thread context.
 */
function resolveRequiredRoleLabel(
  request: DiscordControlRequest,
): string | undefined {
  switch (request.action) {
    case DEVPLAT_ACTION_NEW_PROJECT:
    case DEVPLAT_ACTION_OPEN_PROJECT:
    case DEVPLAT_ACTION_PROJECT_SETTINGS:
    case DEVPLAT_ACTION_CANCEL_PROJECT:
    case DEVPLAT_ACTION_RESUME_PROJECT:
      return 'project-operator';
    case DEVPLAT_ACTION_RELEASE_PROJECT:
      return 'project-operator | merge-approver';
    case DEVPLAT_ACTION_MERGE_NOW:
      return 'merge-approver';
    case DEVPLAT_ACTION_APPROVE_THIS:
      return request.workItem?.threadKind === 'pull-request'
        ? 'merge-approver'
        : 'spec-approver';
    default:
      return undefined;
  }
}

/**
 * Creates the compact DevPlat component custom id.
 */
function createDiscordComponentCustomId(
  action: DiscordControlAction,
  threadId: string,
  forceResumeProject: boolean,
): string {
  const actionToken =
    forceResumeProject && action === DEVPLAT_ACTION_RESUME_PROJECT
      ? DISCORD_RESUME_PROJECT_FORCE_COMPONENT_ACTION_TOKEN
      : action;
  const customId = `${DISCORD_COMPONENT_CUSTOM_ID_PREFIX}:${actionToken}:${threadId}`;
  if (customId.length > DISCORD_CUSTOM_ID_MAX_LENGTH) {
    throw new Error('Discord component custom_id exceeds 100 characters.');
  }

  return customId;
}

/**
 * Resolves whether a resume button is an explicit force confirmation.
 */
function shouldCreateResumeProjectForceButton(
  request: DiscordControlRequest,
  action: DiscordControlAction,
): boolean {
  if (
    action !== DEVPLAT_ACTION_RESUME_PROJECT ||
    request.action !== DEVPLAT_ACTION_RESUME_PROJECT
  ) {
    return false;
  }

  return resolveResumeProjectPreflightFields(request)['Preflight'] === 'forced';
}

/**
 * Resolves the Discord button style for a control action.
 */
function resolveButtonStyle(action: DiscordControlAction): DiscordButtonStyle {
  switch (action) {
    case DEVPLAT_ACTION_APPROVE_THIS:
      return DISCORD_BUTTON_STYLE_SUCCESS;
    case DEVPLAT_ACTION_BLOCK_THIS:
    case DEVPLAT_ACTION_RELEASE_WORKTREE:
      return DISCORD_BUTTON_STYLE_DANGER;
    case DEVPLAT_ACTION_RUN_THIS:
    case DEVPLAT_ACTION_RETRY_GATES:
      return DISCORD_BUTTON_STYLE_PRIMARY;
    case DEVPLAT_ACTION_CANCEL_PROJECT:
    case DEVPLAT_ACTION_RELEASE_PROJECT:
      return DISCORD_BUTTON_STYLE_DANGER;
    case DEVPLAT_ACTION_CLAIM_THIS:
    case DEVPLAT_ACTION_COMPLETE_THIS:
    case DEVPLAT_ACTION_CONSIDER:
    case DEVPLAT_ACTION_EXPLAIN_FAILURE:
    case DEVPLAT_ACTION_NEW_PROJECT:
    case DEVPLAT_ACTION_OPEN_PROJECT:
    case DEVPLAT_ACTION_MERGE_NOW:
    case DEVPLAT_ACTION_PAUSE_THIS:
    case DEVPLAT_ACTION_PHASE_CONTRACT:
    case DEVPLAT_ACTION_PROJECT_SETTINGS:
    case DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY:
    case DEVPLAT_ACTION_PROJECT_SUMMARY:
    case DEVPLAT_ACTION_REDIRECT:
    case DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS:
    case DEVPLAT_ACTION_RESEARCH:
    case DEVPLAT_ACTION_RESUME_THIS:
    case DEVPLAT_ACTION_RESUME_PROJECT:
    case DEVPLAT_ACTION_SPEC:
    case DEVPLAT_ACTION_SHOW_LAST_ARTIFACT:
    case DEVPLAT_ACTION_SHOW_STATUS:
    case DEVPLAT_ACTION_SYNC_WORKTREE:
    case DEVPLAT_ACTION_ALTERNATIVES:
    case DEVPLAT_ACTION_UPDATE_SPEC:
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
    case DEVPLAT_ACTION_APPROVE_THIS:
      return request.workItem?.threadKind === 'pull-request'
        ? display.controls
        : display.controls.filter(
            (action) => action !== DEVPLAT_ACTION_MERGE_NOW,
          );
    case DEVPLAT_ACTION_ALTERNATIVES:
    case DEVPLAT_ACTION_CANCEL_PROJECT:
    case DEVPLAT_ACTION_CONSIDER:
    case DEVPLAT_ACTION_NEW_PROJECT:
    case DEVPLAT_ACTION_OPEN_PROJECT:
    case DEVPLAT_ACTION_PHASE_CONTRACT:
    case DEVPLAT_ACTION_PROJECT_SETTINGS:
    case DEVPLAT_ACTION_PROJECT_SETTINGS_HISTORY:
    case DEVPLAT_ACTION_PROJECT_SUMMARY:
    case DEVPLAT_ACTION_REDIRECT:
    case DEVPLAT_ACTION_RELEASE_PROJECT:
    case DEVPLAT_ACTION_RESEARCH:
    case DEVPLAT_ACTION_RESUME_PROJECT:
    case DEVPLAT_ACTION_SPEC:
    case DEVPLAT_ACTION_BLOCK_THIS:
    case DEVPLAT_ACTION_CLAIM_THIS:
    case DEVPLAT_ACTION_COMPLETE_THIS:
    case DEVPLAT_ACTION_EXPLAIN_FAILURE:
    case DEVPLAT_ACTION_MERGE_NOW:
    case DEVPLAT_ACTION_PAUSE_THIS:
    case DEVPLAT_ACTION_REBASE_ALL_DEPENDENTS:
    case DEVPLAT_ACTION_RELEASE_WORKTREE:
    case DEVPLAT_ACTION_RESUME_THIS:
    case DEVPLAT_ACTION_RETRY_GATES:
    case DEVPLAT_ACTION_RUN_THIS:
    case DEVPLAT_ACTION_SHOW_LAST_ARTIFACT:
    case DEVPLAT_ACTION_SHOW_STATUS:
    case DEVPLAT_ACTION_SYNC_WORKTREE:
    case DEVPLAT_ACTION_UPDATE_SPEC:
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
    custom_id: createDiscordComponentCustomId(
      action,
      request.threadId,
      shouldCreateResumeProjectForceButton(request, action),
    ),
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
 * Creates a structured payload without controls for ephemeral interaction completion.
 */
function createDiscordContentOnlyPayload(
  content: string,
): DiscordMessagePayload {
  return {
    content,
    /**
     * Discord message payload wire key; required to prevent accidental operator pings.
     */
    allowed_mentions: safeAllowedMentions,
    flags: DISCORD_EPHEMERAL_MESSAGE_FLAG,
  };
}

/**
 * Renders the minimal follow-up that completes a deferred Discord interaction.
 */
export function renderDiscordInteractionCompletionMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const content = renderDiscordMessageContent({
    actionLabel: 'Interaction completed',
    fields: {
      Status: 'posted',
      Scope: renderDiscordScopeValue(request),
      Item: renderDiscordItemValue(request),
    },
    indicator: 'ℹ️',
    result: 'Result posted to the bound thread.',
  });

  return createDiscordContentOnlyPayload(content);
}

/**
 * Renders the minimal follow-up that closes a deferred interaction after thread posting fails.
 */
export function renderDiscordInteractionThreadPostFailureCompletionMessage(
  request: DiscordControlRequest,
  reason: string,
): DiscordMessagePayload {
  const content = renderDiscordMessageContent({
    actionLabel: 'Interaction completed',
    fields: {
      Status: 'thread-post-failed',
      Scope: renderDiscordScopeValue(request),
      Item: renderDiscordItemValue(request),
      Reason: reason,
    },
    indicator: '🔴',
    result: 'Action was recorded, but the bound-thread status message failed.',
  });

  return createDiscordContentOnlyPayload(content);
}

/**
 * Renders the standard accepted-action message.
 */
export function renderDiscordControlAcceptedMessage(
  request: DiscordControlRequest,
): DiscordMessagePayload {
  const display = resolveActionDisplay(request.action);
  const showStatusOrderedFields = resolveShowStatusOrderedFields(request);
  const statusFields =
    request.action === DEVPLAT_ACTION_SHOW_STATUS
      ? showStatusOrderedFields
      : {
          Status: 'accepted',
          Scope: renderDiscordScopeValue(request),
          Item: renderDiscordItemValue(request),
          Actor: describeActor(request.actorId),
          ...resolveStatusSummaryMetadataFields(request),
          ...resolveProjectSummaryVisibilityFields(request),
          ...resolveResumeProjectPreflightFields(request),
          ...resolveReleaseSummaryFields(request),
          ...resolveOpenProjectDashboardFields(request),
          ...resolveDiscoveryControlFields(request),
          ...resolveAlternativesFields(request),
          ...resolveProjectSettingsHistoryFields(request),
        };
  const content = renderDiscordMessageContent({
    actionLabel: display.acceptedTitle,
    fields: statusFields,
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
  reason = 'policy denied this action',
): DiscordMessagePayload {
  const requiredRole = resolveRequiredRoleLabel(request);
  const content = renderDiscordMessageContent({
    actionLabel: 'Action blocked',
    fields: {
      Status: 'blocked',
      Caller: describeActor(request.actorId),
      Action: request.action,
      Scope: renderDiscordScopeValue(request),
      Context: renderBlockedActionContextValue(request),
      ...resolveStatusSummaryMetadataFields(request),
      ...(requiredRole === undefined ? {} : { 'Required role': requiredRole }),
      Reason: reason,
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
  reason = 'interaction must resolve to exactly one bound thread',
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
    action: DEVPLAT_ACTION_SHOW_STATUS,
    privileged: false,
  } satisfies DiscordControlRequest;
  const isThreadRoutingFailure =
    reason.includes('must resolve to exactly one bound thread') ||
    reason.includes('bound session thread mismatch') ||
    reason.includes('project/thread context mismatch');
  const content = renderDiscordMessageContent({
    actionLabel: 'Action refused',
    fields: {
      Status: 'blocked',
      Scope: 'unresolved',
      Reason: reason,
    },
    indicator: '🔴',
    result: isThreadRoutingFailure
      ? 'Run this from the correct spec, implementation, or PR thread.'
      : 'Review the reason and retry with correct permissions/options or thread context.',
  });
  const diagnosticSeparator = '\n\n';
  const diagnostic = renderDiscordReceivedEventDiagnostic(
    input,
    DISCORD_MESSAGE_CONTENT_MAX_LENGTH -
      content.length -
      diagnosticSeparator.length,
  );

  return createDiscordPayload(
    [content, diagnostic].join(diagnosticSeparator),
    request,
    failureControls,
  );
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
    DEVPLAT_ACTION_RUN_THIS,
    DEVPLAT_ACTION_RETRY_GATES,
    DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
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
      ...resolveArtifactMetadataFields(request),
    },
    indicator: '📎',
    result: `${resolveArtifactInterpretation(request)} Latest artifact is attached, linked, or summarized below.`,
  });

  return createDiscordPayload(content, request, [
    DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
    DEVPLAT_ACTION_SHOW_STATUS,
    DEVPLAT_ACTION_EXPLAIN_FAILURE,
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
    DEVPLAT_ACTION_RETRY_GATES,
    DEVPLAT_ACTION_SHOW_LAST_ARTIFACT,
  ]);
}

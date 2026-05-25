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
  DISCORD_BUTTON_COMPONENT_TYPE,
  DISCORD_BUTTON_LABEL_MAX_LENGTH,
  DISCORD_BUTTON_STYLE_DANGER,
  DISCORD_BUTTON_STYLE_PRIMARY,
  DISCORD_BUTTON_STYLE_SECONDARY,
  DISCORD_BUTTON_STYLE_SUCCESS,
  DISCORD_COMPONENT_CUSTOM_ID_PREFIX,
  DISCORD_CUSTOM_ID_MAX_LENGTH,
  DISCORD_EPHEMERAL_MESSAGE_FLAG,
  DISCORD_MESSAGE_CONTENT_MAX_LENGTH,
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
      'Global preflight is running before project resume. If issues are detected, a second confirmation is required. Use /resume-project --force to acknowledge and continue.',
    controls: [DEVPLAT_ACTION_PROJECT_SUMMARY, DEVPLAT_ACTION_SHOW_STATUS],
  },
  [DEVPLAT_ACTION_RELEASE_PROJECT]: {
    label: 'Release Project',
    acceptedTitle: 'Release requested',
    acceptedIndicator: '🟡',
    result: 'Release preconditions are being re-validated.',
    controls: [DEVPLAT_ACTION_PROJECT_SUMMARY, DEVPLAT_ACTION_SHOW_STATUS],
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
    controls: [DEVPLAT_ACTION_APPROVE_THIS, DEVPLAT_ACTION_SHOW_STATUS],
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
} {
  const runIntent = resolveSummaryMarkerValue(summary, '(intent:');
  const configVersion = resolveSummaryMarkerValue(summary, '(config-version:');

  return {
    ...(runIntent === undefined || runIntent.length === 0 ? {} : { runIntent }),
    ...(configVersion === undefined || configVersion.length === 0
      ? {}
      : { configVersion }),
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

  return summary.slice(valueStart, valueEnd).trim();
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

  let mode: string | undefined;
  let checks: string | undefined;
  let issues: string | undefined;
  for (const token of tokens) {
    const separatorIndex = token.indexOf(':');
    if (separatorIndex <= 0) {
      mode = token;
      continue;
    }
    const key = token.slice(0, separatorIndex);
    const value = token.slice(separatorIndex + 1);
    if (key === 'issues') {
      issues = value;
      continue;
    }
    checks =
      checks === undefined ? `${key}:${value}` : `${checks}, ${key}:${value}`;
  }

  return {
    ...(mode === undefined ? {} : { Preflight: mode }),
    ...(checks === undefined ? {} : { Checks: checks }),
    ...(issues === undefined ? {} : { Issues: issues }),
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

  return {
    Repo: repo ?? 'unknown',
    Branch: branch ?? 'unknown',
    'Merged PR links': mergedPullRequestLinks ?? 'none recorded',
    'Spec link': specLink ?? 'unavailable',
    'Slice list/status': sliceListStatus ?? 'unavailable',
    'Gate results': gateResults ?? 'unavailable',
    'Unresolved risks': unresolvedRisks ?? 'none reported',
    'Follow-up recommendations': followUpRecommendations ?? 'none',
    'Asset links': assetLinks ?? 'none published',
    'Blocker incidents':
      blockerIncidents ?? 'current-run:unknown lifetime:unknown',
    'Stall incidents': stallIncidents ?? 'current-run:unknown lifetime:unknown',
    'Contract degradation incidents':
      contractDegradationIncidents ?? 'current-run:unknown lifetime:unknown',
    'Incident links': incidentLinks ?? 'restricted/unavailable',
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
  const content = renderDiscordMessageContent({
    actionLabel: display.acceptedTitle,
    fields: {
      Status: 'accepted',
      Scope: renderDiscordScopeValue(request),
      Item: renderDiscordItemValue(request),
      Actor: describeActor(request.actorId),
      ...resolveStatusSummaryMetadataFields(request),
      ...resolveResumeProjectPreflightFields(request),
      ...resolveReleaseSummaryFields(request),
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
  const content = renderDiscordMessageContent({
    actionLabel: 'Action refused',
    fields: {
      Status: 'blocked',
      Scope: 'unresolved',
      Reason: reason,
    },
    indicator: '🔴',
    result: 'Run this from the correct spec, implementation, or PR thread.',
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

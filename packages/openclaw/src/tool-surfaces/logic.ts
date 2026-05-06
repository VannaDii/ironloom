import {
  OPENCLAW_OPERATIONAL_RESULT_KEY,
  OPENCLAW_OPERATIONAL_STATUS_ALLOWED,
  OPENCLAW_OPERATIONAL_STATUS_BLOCKED,
  OPENCLAW_OPERATIONAL_STATUS_FAILED,
  OPENCLAW_OPERATIONAL_STATUS_SUCCEEDED,
  OPENCLAW_TOOL_FIELD_ALLOWED,
  OPENCLAW_TOOL_FIELD_ARTIFACT_ID,
  OPENCLAW_TOOL_FIELD_ARTIFACT_TYPE,
  OPENCLAW_TOOL_FIELD_BRANCH_SAFETY,
  OPENCLAW_TOOL_FIELD_CLASSIFICATION,
  OPENCLAW_TOOL_FIELD_ID,
  OPENCLAW_TOOL_FIELD_KEY,
  OPENCLAW_TOOL_FIELD_NEXT_ACTION,
  OPENCLAW_TOOL_FIELD_PASSED,
  OPENCLAW_TOOL_FIELD_PERSISTED_KEY,
  OPENCLAW_TOOL_FIELD_PERSISTED_RECORD_KEY,
  OPENCLAW_TOOL_FIELD_POLICY_DECISION_ID,
  OPENCLAW_TOOL_FIELD_RECORD,
  OPENCLAW_TOOL_FIELD_STATUS,
  OPENCLAW_TOOL_FIELD_SUCCESS,
  OPENCLAW_TOOL_FIELD_TELEMETRY_EVENT_ID,
  REDACTED_TOOL_PAYLOAD_VALUE,
  TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN,
} from './constants.js';

/**
 * Generic object shape used while projecting unknown tool payloads.
 */
type UnknownRecord = Record<string, unknown>;

/**
 * Returns true when a value can be inspected through string keys.
 */
function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns true when a payload key name conventionally carries secret material.
 */
function isSensitiveKey(key: string): boolean {
  const normalized = key
    .replace(TOOL_PAYLOAD_KEY_IGNORED_CHARACTER_PATTERN, '')
    .toLowerCase();

  return (
    normalized === 'publickey' ||
    normalized === 'privatekey' ||
    normalized.endsWith('token') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('password') ||
    normalized.endsWith('apikey')
  );
}

/**
 * Reads a non-empty string field from a decoded package payload.
 */
function readStringField(
  record: UnknownRecord,
  fieldName: string,
): string | undefined {
  const value = record[fieldName];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Reads a boolean field from a decoded package payload.
 */
function readBooleanField(
  record: UnknownRecord,
  fieldName: string,
): boolean | undefined {
  const value = record[fieldName];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Reads a nested non-empty string field from a decoded package payload.
 */
function readNestedStringField(
  record: UnknownRecord,
  objectFieldName: string,
  valueFieldName: string,
): string | undefined {
  const nested = record[objectFieldName];
  return isUnknownRecord(nested)
    ? readStringField(nested, valueFieldName)
    : undefined;
}

/**
 * Maps boolean operation evidence to an operator-facing status.
 */
function resolveBooleanOperationalStatus(
  value: boolean,
  positiveStatus: string,
  negativeStatus: string,
): string {
  return value ? positiveStatus : negativeStatus;
}

/**
 * Resolves the operator-facing status for a delegated OpenClaw tool payload.
 */
function resolveOpenClawOperationalStatus(
  record: UnknownRecord,
): string | undefined {
  const status = readStringField(record, OPENCLAW_TOOL_FIELD_STATUS);
  if (status !== undefined) {
    return status;
  }

  const allowed = readBooleanField(record, OPENCLAW_TOOL_FIELD_ALLOWED);
  if (allowed !== undefined) {
    return resolveBooleanOperationalStatus(
      allowed,
      OPENCLAW_OPERATIONAL_STATUS_ALLOWED,
      OPENCLAW_OPERATIONAL_STATUS_BLOCKED,
    );
  }

  const passed = readBooleanField(record, OPENCLAW_TOOL_FIELD_PASSED);
  if (passed !== undefined) {
    return resolveBooleanOperationalStatus(
      passed,
      OPENCLAW_OPERATIONAL_STATUS_SUCCEEDED,
      OPENCLAW_OPERATIONAL_STATUS_FAILED,
    );
  }

  const success = readBooleanField(record, OPENCLAW_TOOL_FIELD_SUCCESS);
  return success === undefined
    ? undefined
    : resolveBooleanOperationalStatus(
        success,
        OPENCLAW_OPERATIONAL_STATUS_SUCCEEDED,
        OPENCLAW_OPERATIONAL_STATUS_FAILED,
      );
}

/**
 * Resolves artifact evidence from direct artifact fields or envelopes.
 */
function resolveOpenClawOperationalArtifactId(
  record: UnknownRecord,
): string | undefined {
  const artifactId = readStringField(record, OPENCLAW_TOOL_FIELD_ARTIFACT_ID);
  if (artifactId !== undefined) {
    return artifactId;
  }

  const artifactType = readStringField(
    record,
    OPENCLAW_TOOL_FIELD_ARTIFACT_TYPE,
  );
  const id = readStringField(record, OPENCLAW_TOOL_FIELD_ID);
  return artifactType === undefined ? undefined : id;
}

/**
 * Resolves storage evidence from direct or nested record keys.
 */
function resolveOpenClawOperationalPersistedRecordKey(
  record: UnknownRecord,
): string | undefined {
  return (
    readStringField(record, OPENCLAW_TOOL_FIELD_PERSISTED_KEY) ??
    readStringField(record, OPENCLAW_TOOL_FIELD_KEY) ??
    readNestedStringField(
      record,
      OPENCLAW_TOOL_FIELD_RECORD,
      OPENCLAW_TOOL_FIELD_KEY,
    )
  );
}

/**
 * Resolves the next lifecycle hint exposed by delegated package results.
 */
function resolveOpenClawOperationalNextAction(
  record: UnknownRecord,
): string | undefined {
  return (
    readStringField(record, OPENCLAW_TOOL_FIELD_NEXT_ACTION) ??
    readNestedStringField(
      record,
      OPENCLAW_TOOL_FIELD_CLASSIFICATION,
      OPENCLAW_TOOL_FIELD_NEXT_ACTION,
    ) ??
    readNestedStringField(
      record,
      OPENCLAW_TOOL_FIELD_BRANCH_SAFETY,
      OPENCLAW_TOOL_FIELD_NEXT_ACTION,
    )
  );
}

/**
 * Adds a field to the operational result only when evidence is available.
 */
function addOpenClawOperationalField(
  result: UnknownRecord,
  fieldName: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    result[fieldName] = value;
  }
}

/**
 * Builds adapter-level lifecycle evidence for one delegated tool result.
 */
function createOpenClawOperationalResult(
  record: UnknownRecord,
): UnknownRecord | undefined {
  const result: UnknownRecord = {};
  addOpenClawOperationalField(
    result,
    OPENCLAW_TOOL_FIELD_STATUS,
    resolveOpenClawOperationalStatus(record),
  );
  addOpenClawOperationalField(
    result,
    OPENCLAW_TOOL_FIELD_ARTIFACT_ID,
    resolveOpenClawOperationalArtifactId(record),
  );
  addOpenClawOperationalField(
    result,
    OPENCLAW_TOOL_FIELD_PERSISTED_RECORD_KEY,
    resolveOpenClawOperationalPersistedRecordKey(record),
  );
  addOpenClawOperationalField(
    result,
    OPENCLAW_TOOL_FIELD_POLICY_DECISION_ID,
    readStringField(record, OPENCLAW_TOOL_FIELD_POLICY_DECISION_ID),
  );
  addOpenClawOperationalField(
    result,
    OPENCLAW_TOOL_FIELD_TELEMETRY_EVENT_ID,
    readStringField(record, OPENCLAW_TOOL_FIELD_TELEMETRY_EVENT_ID),
  );
  addOpenClawOperationalField(
    result,
    OPENCLAW_TOOL_FIELD_NEXT_ACTION,
    resolveOpenClawOperationalNextAction(record),
  );

  return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * Adds consistent OpenClaw operational evidence to object-shaped tool payloads.
 */
export function createOpenClawOperationalToolPayload(
  payload: unknown,
): unknown {
  if (
    !isUnknownRecord(payload) ||
    isUnknownRecord(payload[OPENCLAW_OPERATIONAL_RESULT_KEY])
  ) {
    return payload;
  }

  const operationalResult = createOpenClawOperationalResult(payload);
  return operationalResult === undefined
    ? payload
    : {
        ...payload,
        [OPENCLAW_OPERATIONAL_RESULT_KEY]: operationalResult,
      };
}

/**
 * Recursively replaces sensitive payload values with a display-safe marker.
 */
export function sanitizeToolPayloadForDisplay(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeToolPayloadForDisplay(item));
  }

  if (typeof payload !== 'object' || payload === null) {
    return payload;
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      isSensitiveKey(key)
        ? REDACTED_TOOL_PAYLOAD_VALUE
        : sanitizeToolPayloadForDisplay(value),
    ]),
  );
}

/**
 * Serializes a sanitized tool payload for text result display.
 */
export function formatToolPayloadText(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Sanitizes and serializes a tool payload for OpenClaw text responses.
 */
export function createToolPayloadText(payload: unknown): string {
  return formatToolPayloadText(
    sanitizeToolPayloadForDisplay(
      createOpenClawOperationalToolPayload(payload),
    ),
  );
}

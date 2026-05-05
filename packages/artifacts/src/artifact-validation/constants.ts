/**
 * Diagnostic code emitted when an artifact must be migrated before validation.
 */
export const ARTIFACT_VALIDATION_MIGRATION_REQUIRED_ERROR_CODE =
  'artifact.migration_required';

/**
 * Diagnostic code emitted when a delegated payload validator rejects an artifact.
 */
export const ARTIFACT_VALIDATION_PAYLOAD_INVALID_ERROR_CODE =
  'artifact.payload_invalid';

/**
 * Separator used when an artifact must follow multiple migration records.
 */
export const ARTIFACT_VALIDATION_MIGRATION_PATH_SEPARATOR = ' -> ';

/**
 * Trace prefix appended after delegated payload validation succeeds.
 */
export const ARTIFACT_VALIDATION_PAYLOAD_TRACE_PREFIX = 'artifact-payload:';

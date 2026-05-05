/**
 * Error returned when command execution receives an absolute working directory.
 */
export const COMMAND_EXECUTION_CWD_ABSOLUTE_ERROR =
  'cwd must be a relative repository path.';

/**
 * Error returned when command execution receives a repository traversal path.
 */
export const COMMAND_EXECUTION_CWD_TRAVERSAL_ERROR =
  'cwd must stay within the repository root.';

/**
 * Subprocess exit codes retried when callers do not provide an override.
 */
export const COMMAND_EXECUTION_DEFAULT_RETRYABLE_EXIT_CODES = [1, 124];

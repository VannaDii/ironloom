/**
 * Gate next action emitted when all checks pass.
 */
export const GATE_NEXT_ACTION_CONTINUE = 'continue';

/**
 * Gate next action emitted when failed gates need remediation work.
 */
export const GATE_NEXT_ACTION_REMEDIATE_FAILURE = 'remediate-failure';

/**
 * Gate classification next action emitted when a remediation plan is needed.
 */
export const GATE_NEXT_ACTION_CREATE_REMEDIATION_PLAN =
  'create-remediation-plan';

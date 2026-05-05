import {
  createPolicyDecision,
  describePolicyDecision,
  evaluateLifecyclePolicyAction,
  evaluatePolicyDecision,
} from './logic.js';
import type { PolicyActionEvaluation, PolicyDecision } from './codec.js';

/** Decision policy service. */
export class DecisionPolicyService {
  /** Executes the service operation. */
  public execute(input: PolicyDecision): PolicyDecision {
    return createPolicyDecision(input);
  }

  /** Describes the service result for operators. */
  public explain(input: PolicyDecision): string {
    return describePolicyDecision(input);
  }

  /** Evaluate control action. */
  public evaluateControlAction(
    action: string,
    privileged: boolean,
  ): PolicyDecision {
    return evaluatePolicyDecision(action, privileged);
  }

  /** Evaluate lifecycle action. */
  public evaluateLifecycleAction(
    action: string,
    privileged: boolean,
  ): PolicyActionEvaluation {
    return evaluateLifecyclePolicyAction(action, privileged);
  }
}

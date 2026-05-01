import {
  createPolicyDecision,
  describePolicyDecision,
  evaluateLifecyclePolicyAction,
  evaluatePolicyDecision,
} from './logic.js';
import type { PolicyActionEvaluation, PolicyDecision } from './codec.js';

export class DecisionPolicyService {
  public execute(input: PolicyDecision): PolicyDecision {
    return createPolicyDecision(input);
  }

  public explain(input: PolicyDecision): string {
    return describePolicyDecision(input);
  }

  public evaluateControlAction(
    action: string,
    privileged: boolean,
  ): PolicyDecision {
    return evaluatePolicyDecision(action, privileged);
  }

  public evaluateLifecycleAction(
    action: string,
    privileged: boolean,
  ): PolicyActionEvaluation {
    return evaluateLifecyclePolicyAction(action, privileged);
  }
}

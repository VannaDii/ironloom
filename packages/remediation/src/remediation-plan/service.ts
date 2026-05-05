import type { GateRemediationHook } from '@vannadii/devplat-gates';
import type { ReviewFinding } from '@vannadii/devplat-review';

import { createRemediationPlan, describeRemediationPlan } from './logic.js';
import type { RemediationPlan } from './codec.js';

/** Remediation plan service. */
export class RemediationPlanService {
  /** Creates a remediation plan. */
  public create(input: RemediationPlan): RemediationPlan {
    return createRemediationPlan(input);
  }

  /** From findings. */
  public fromFindings(
    findings: readonly ReviewFinding[],
    autofix: boolean,
  ): RemediationPlan {
    return createRemediationPlan({
      planId: `remediation-${findings.map((finding) => finding.findingId).join('-')}`,
      findingIds: findings.map((finding) => finding.findingId),
      actions: findings.map((finding) => finding.fixRecommendation),
      autofix,
      approvalRequired:
        !autofix ||
        findings.some(
          (finding) =>
            finding.severity === 'high' || finding.severity === 'critical',
        ),
      updatedAt: new Date().toISOString(),
    });
  }

  /** From gate hook. */
  public fromGateHook(
    hook: GateRemediationHook,
    autofix = hook.autofixEligible,
  ): RemediationPlan {
    return createRemediationPlan({
      planId: `remediation-${hook.hookId}`,
      findingIds: hook.remediationFindingIds,
      actions: hook.actions,
      autofix,
      approvalRequired: hook.approvalRequired || !autofix,
      updatedAt: hook.createdAt,
    });
  }

  /** Executes the service operation. */
  public execute(input: RemediationPlan): RemediationPlan {
    return this.create(input);
  }

  /** Describes the service result for operators. */
  public explain(input: RemediationPlan): string {
    return describeRemediationPlan(input);
  }
}

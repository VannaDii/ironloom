import type { GateRemediationHook } from '@vannadii/devplat-gates';
import type { ReviewFinding } from '@vannadii/devplat-review';

import { createRemediationPlan, describeRemediationPlan } from './logic.js';
import type { RemediationPlan } from './types.js';

export class RemediationPlanService {
  public create(input: RemediationPlan): RemediationPlan {
    return createRemediationPlan(input);
  }

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

  public execute(input: RemediationPlan): RemediationPlan {
    return this.create(input);
  }

  public explain(input: RemediationPlan): string {
    return describeRemediationPlan(input);
  }
}

import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';

import {
  createSupervisorDecision,
  decideNextState,
  describeSupervisorDecision,
} from './logic.js';
import type { SupervisorDecision } from './codec.js';

/** Supervisor cycle service. */
export class SupervisorCycleService {
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly telemetry = new TelemetryEventService(),
  ) {}

  /** Executes the service operation. */
  public execute(input: SupervisorDecision): SupervisorDecision {
    return createSupervisorDecision(input);
  }

  /** Describes the service result for operators. */
  public explain(input: SupervisorDecision): string {
    return describeSupervisorDecision(input);
  }

  /** Run step. */
  public async runStep(params: {
    action: string;
    actorId: string;
    privileged: boolean;
    lifecycleSignals?: SupervisorDecision['lifecycleSignals'];
  }): Promise<SupervisorDecision> {
    const policyDecision = this.policy.evaluateControlAction(
      params.action,
      params.privileged,
    );
    const decision = createSupervisorDecision({
      ...decideNextState(policyDecision),
      lifecycleSignals: params.lifecycleSignals ?? [],
    });

    await this.telemetry.record({
      id: decision.id,
      summary: decision.summary,
      status: decision.status,
      trace: decision.trace,
      updatedAt: decision.updatedAt,
      actorId: params.actorId,
      action: params.action,
      scope: 'supervisor',
      details: {
        nextState: decision.nextState,
        approved: decision.approved,
        phase: decision.phase,
        routePlan: decision.routePlan,
      },
    });

    return decision;
  }
}

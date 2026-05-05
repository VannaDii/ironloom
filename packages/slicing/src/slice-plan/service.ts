import { createSlicePlan, describeSlicePlan, isSliceReady } from './logic.js';
import type { SlicePlan } from './codec.js';

/** Slice plan service service. */
export class SlicePlanService {
  /** Plan. */
  public plan(input: SlicePlan): SlicePlan {
    return createSlicePlan(input);
  }

  /** Executes the service operation. */
  public execute(input: SlicePlan): SlicePlan {
    return this.plan(input);
  }

  /** Ready for execution. */
  public readyForExecution(
    input: SlicePlan,
    completedSliceIds: readonly string[],
  ): boolean {
    return isSliceReady(createSlicePlan(input), completedSliceIds);
  }

  /** Describes the service result for operators. */
  public explain(input: SlicePlan): string {
    return describeSlicePlan(input);
  }
}

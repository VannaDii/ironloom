import { createSlicePlan, describeSlicePlan, isSliceReady } from './logic.js';
import type { SlicePlan } from './codec.js';

export class SlicePlanService {
  public plan(input: SlicePlan): SlicePlan {
    return createSlicePlan(input);
  }

  public execute(input: SlicePlan): SlicePlan {
    return this.plan(input);
  }

  public readyForExecution(
    input: SlicePlan,
    completedSliceIds: readonly string[],
  ): boolean {
    return isSliceReady(createSlicePlan(input), completedSliceIds);
  }

  public explain(input: SlicePlan): string {
    return describeSlicePlan(input);
  }
}

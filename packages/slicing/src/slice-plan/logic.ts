import type {
  SliceDependencyGraph,
  SlicePlan,
  SliceWorkPacket,
} from './codec.js';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function buildSliceDependencyGraph(
  input: SlicePlan,
): SliceDependencyGraph {
  const blockedBy = uniqueTrimmed(input.dependsOn);
  const sliceId = input.sliceId.trim();
  return {
    sliceId,
    graphId: `${sliceId}:dependencies`,
    generatedAt: new Date(input.updatedAt).toISOString(),
    edges: blockedBy.map((dependency) => ({
      fromSliceId: dependency,
      toSliceId: sliceId,
    })),
    blockedBy,
    dependencyCount: blockedBy.length,
  };
}

export function buildSliceWorkPacket(input: SlicePlan): SliceWorkPacket {
  const sliceId = input.sliceId.trim();
  const taskIds = uniqueTrimmed(input.doneConditions).map(
    (_condition, index) => `${sliceId}-task-${String(index + 1)}`,
  );
  const reviewFocus = uniqueTrimmed(input.acceptanceCriteria);
  return {
    packetId: `${sliceId}:work-packet`,
    branchName: `devplat/${sliceId}`,
    taskIds,
    estimatedTaskCount: taskIds.length,
    estimatedPullRequestCount: input.size === 'large' ? 2 : 1,
    pullRequestTitle: `feat: implement ${input.title.trim()}`,
    reviewFocus,
  };
}

export function createSlicePlan(input: SlicePlan): SlicePlan {
  const dependsOn = uniqueTrimmed(input.dependsOn);
  const doneConditions = uniqueTrimmed(input.doneConditions);
  return {
    ...input,
    title: input.title.trim(),
    dependsOn,
    acceptanceCriteria: uniqueTrimmed(input.acceptanceCriteria),
    doneConditions,
    updatedAt: new Date(input.updatedAt).toISOString(),
    dependencyGraph: input.dependencyGraph ?? buildSliceDependencyGraph(input),
    workPacket: input.workPacket ?? buildSliceWorkPacket(input),
  };
}

export function isSliceReady(
  input: SlicePlan,
  completedSliceIds: readonly string[],
): boolean {
  return input.dependsOn.every((dependency) =>
    completedSliceIds.includes(dependency),
  );
}

export function describeSlicePlan(input: SlicePlan): string {
  return `Slice plan -> ${input.title}`;
}

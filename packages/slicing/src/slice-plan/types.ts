export type SliceSize = 'small' | 'medium' | 'large';

export interface SliceDependencyEdge {
  fromSliceId: string;
  toSliceId: string;
}

export interface SliceDependencyGraph {
  sliceId: string;
  edges: SliceDependencyEdge[];
  blockedBy: string[];
}

export interface SliceWorkPacket {
  branchName: string;
  taskIds: string[];
  estimatedPullRequestCount: number;
}

export interface SlicePlan {
  sliceId: string;
  specId: string;
  title: string;
  dependsOn: string[];
  acceptanceCriteria: string[];
  doneConditions: string[];
  size: SliceSize;
  updatedAt: string;
  dependencyGraph?: SliceDependencyGraph;
  workPacket?: SliceWorkPacket;
}

import {
  appendTrace,
  decodeWithCodec,
  GitBranchNameCodec,
} from '@vannadii/devplat-core';

import {
  WORKTREE_BLOCKED_PATH_MARKER,
  WORKTREE_BLOCKED_PATH_SEGMENT,
  WORKTREE_BLOCKED_BASE_BRANCH_NAME,
  WORKTREE_DEFAULT_ROOT,
  WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE,
  WORKTREE_UNSAFE_GIT_REF_CHARACTERS,
} from './constants.js';
import type {
  WorktreeAllocation,
  WorktreeBranchSafetyCheck,
  WorktreeReleaseMode,
  WorktreeReleaseResult,
  WorktreeSyncMode,
  WorktreeSyncResult,
} from './codec.js';

function trimWorktreeValue(value: string): string {
  return value.trim();
}

function createSafetyCheck(input: {
  branchName: string;
  normalizedBranchName: string;
  reason: string;
  nextAction: string;
  safe: boolean;
}): WorktreeBranchSafetyCheck {
  return {
    status: input.safe ? 'safe' : 'blocked',
    branchName: input.branchName,
    normalizedBranchName: input.normalizedBranchName,
    reason: input.reason,
    nextAction: input.nextAction,
  };
}

function normalizeWorktreeBaseBranch(baseBranch: string): {
  blocked: boolean;
  baseBranch: string;
} {
  const decoded = decodeWithCodec(GitBranchNameCodec, baseBranch);
  return decoded.ok
    ? {
        blocked: false,
        baseBranch: decoded.value,
      }
    : {
        blocked: true,
        baseBranch: WORKTREE_BLOCKED_BASE_BRANCH_NAME,
      };
}

function hasUnsafeGitRefCharacter(branchName: string): boolean {
  for (const character of branchName) {
    const codePoint = character.codePointAt(0);
    if (
      character.trim().length === 0 ||
      WORKTREE_UNSAFE_GIT_REF_CHARACTERS.includes(character) ||
      codePoint === undefined ||
      codePoint < 32 ||
      codePoint === 127
    ) {
      return true;
    }
  }

  return false;
}

function findUnsafeGitRefReason(branchName: string): string {
  if (branchName.length === 0) {
    return 'Branch name must not be empty.';
  }

  if (branchName === '@') {
    return 'Branch name must not be a bare @ ref.';
  }

  if (branchName.startsWith('-')) {
    return 'Branch name must not start with a dash.';
  }

  if (branchName.startsWith('/') || branchName.endsWith('/')) {
    return 'Branch name must not start or end with a slash.';
  }

  if (branchName.includes('//')) {
    return 'Branch name must not contain empty path segments.';
  }

  if (branchName.includes('..')) {
    return 'Branch name must not contain parent-directory segments.';
  }

  if (branchName.includes('@{')) {
    return 'Branch name must not contain git reflog syntax.';
  }

  if (branchName.endsWith('.')) {
    return 'Branch name must not end with a dot.';
  }

  const segments = branchName.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) {
    return 'Branch path segments must not start with a dot.';
  }

  if (segments.some((segment) => segment.endsWith('.lock'))) {
    return 'Branch path segments must not end with .lock.';
  }

  if (hasUnsafeGitRefCharacter(branchName)) {
    return 'Branch name contains characters that are unsafe for git refs.';
  }

  return '';
}

export function evaluateWorktreeBranchSafety(
  branchName: string,
): WorktreeBranchSafetyCheck {
  const normalizedBranchName = trimWorktreeValue(branchName);
  const unsafeReason = findUnsafeGitRefReason(normalizedBranchName);

  return createSafetyCheck({
    branchName,
    normalizedBranchName,
    reason: unsafeReason || 'Branch name is safe for git worktree operations.',
    nextAction:
      unsafeReason.length === 0
        ? 'allocate-worktree'
        : 'choose-a-safe-branch-name',
    safe: unsafeReason.length === 0,
  });
}

function createBlockedWorktreePath(
  worktreeRoot: string,
  taskId: string,
): string {
  return `${worktreeRoot}/${WORKTREE_BLOCKED_PATH_SEGMENT}/${taskId}`;
}

function inferWorktreeRoot(worktreePath: string, branchName: string): string {
  const normalizedWorktreePath = trimWorktreeValue(worktreePath);
  const blockedMarkerIndex = normalizedWorktreePath.indexOf(
    WORKTREE_BLOCKED_PATH_MARKER,
  );
  if (blockedMarkerIndex >= 0) {
    return normalizedWorktreePath.slice(0, blockedMarkerIndex);
  }

  const branchSuffix = `/${branchName}`;
  if (branchName.length > 0 && normalizedWorktreePath.endsWith(branchSuffix)) {
    return normalizedWorktreePath.slice(0, -branchSuffix.length);
  }

  return normalizedWorktreePath;
}

export function createWorktreeAllocation(
  input: WorktreeAllocation,
): WorktreeAllocation {
  const taskId = trimWorktreeValue(input.taskId);
  const branchSafety = evaluateWorktreeBranchSafety(input.branchName);
  const branchName = branchSafety.normalizedBranchName;
  const worktreePath =
    branchSafety.status === 'safe'
      ? trimWorktreeValue(input.worktreePath)
      : createBlockedWorktreePath(
          inferWorktreeRoot(input.worktreePath, branchName),
          taskId,
        );

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      status: branchSafety.status === 'safe' ? input.status : 'blocked',
      updatedAt: new Date(input.updatedAt).toISOString(),
      taskId,
      branchName,
      worktreePath,
      branchSafety,
    },
    `worktree:${taskId}:${branchName}`,
  );
}

export function allocateWorktree(
  taskId: string,
  branchName: string,
  worktreeRoot = WORKTREE_DEFAULT_ROOT,
): WorktreeAllocation {
  const normalizedTaskId = trimWorktreeValue(taskId);
  const normalizedBranchName = trimWorktreeValue(branchName);
  const normalizedWorktreeRoot = trimWorktreeValue(worktreeRoot);
  const branchSafety = evaluateWorktreeBranchSafety(normalizedBranchName);
  const safeWorktreePath =
    branchSafety.status === 'safe'
      ? `${normalizedWorktreeRoot}/${normalizedBranchName}`
      : createBlockedWorktreePath(normalizedWorktreeRoot, normalizedTaskId);

  return createWorktreeAllocation({
    id: `worktree-${normalizedTaskId}`,
    summary: `Allocated worktree for ${normalizedTaskId}`,
    status: branchSafety.status === 'safe' ? 'approved' : 'blocked',
    trace: [],
    updatedAt: new Date().toISOString(),
    taskId: normalizedTaskId,
    branchName: normalizedBranchName,
    worktreePath: safeWorktreePath,
    branchSafety,
  });
}

export function describeWorktreeAllocation(input: WorktreeAllocation): string {
  return `${input.branchName} -> ${input.worktreePath}`;
}

export function createWorktreeSyncResult(
  input: WorktreeSyncResult,
): WorktreeSyncResult {
  const taskId = trimWorktreeValue(input.taskId);
  const branchName = trimWorktreeValue(input.branchName);
  const baseBranch = normalizeWorktreeBaseBranch(input.baseBranch);
  const trace = baseBranch.blocked
    ? [...input.trace, WORKTREE_SYNC_BASE_BRANCH_BLOCKED_TRACE]
    : input.trace;

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      baseBranch: baseBranch.baseBranch,
      status: baseBranch.blocked ? 'blocked' : input.status,
      updatedAt: new Date(input.updatedAt).toISOString(),
      taskId,
      branchName,
      worktreePath: trimWorktreeValue(input.worktreePath),
      changed: baseBranch.blocked ? false : input.changed,
      conflictsDetected: baseBranch.blocked ? false : input.conflictsDetected,
      trace,
      ...(input.branchSafety === undefined
        ? {}
        : { branchSafety: input.branchSafety }),
    },
    `worktree:sync:${taskId}:${branchName}:${input.syncMode}`,
  );
}

export function syncWorktree(
  allocation: WorktreeAllocation,
  baseBranch: string,
  syncMode: WorktreeSyncMode = 'rebase',
): WorktreeSyncResult {
  const normalized = createWorktreeAllocation(allocation);
  const branchSafety = evaluateWorktreeBranchSafety(normalized.branchName);
  const safe = branchSafety.status === 'safe';
  const input: WorktreeSyncResult = {
    id: `${normalized.id}:sync:${syncMode}`,
    summary: `Synced worktree for ${normalized.branchName}`,
    status: safe ? 'complete' : 'blocked',
    trace: [...normalized.trace],
    updatedAt: new Date().toISOString(),
    taskId: normalized.taskId,
    branchName: normalized.branchName,
    worktreePath: normalized.worktreePath,
    baseBranch,
    syncMode,
    changed: safe,
    conflictsDetected: false,
  };

  return createWorktreeSyncResult({
    ...input,
    branchSafety,
  });
}

export function createWorktreeReleaseResult(
  input: WorktreeReleaseResult,
): WorktreeReleaseResult {
  const taskId = trimWorktreeValue(input.taskId);
  const branchName = trimWorktreeValue(input.branchName);

  return appendTrace(
    {
      ...input,
      summary: input.summary.trim(),
      updatedAt: new Date(input.updatedAt).toISOString(),
      taskId,
      branchName,
      worktreePath: trimWorktreeValue(input.worktreePath),
      ...(input.branchSafety === undefined
        ? {}
        : { branchSafety: input.branchSafety }),
    },
    `worktree:release:${taskId}:${branchName}:${input.releaseMode}`,
  );
}

export function releaseWorktree(
  allocation: WorktreeAllocation,
  releaseMode: WorktreeReleaseMode = 'archive',
): WorktreeReleaseResult {
  const normalized = createWorktreeAllocation(allocation);
  const branchSafety = evaluateWorktreeBranchSafety(normalized.branchName);
  const input: WorktreeReleaseResult = {
    id: `${normalized.id}:release:${releaseMode}`,
    summary: `Released worktree for ${normalized.branchName}`,
    status: 'complete',
    trace: [...normalized.trace],
    updatedAt: new Date().toISOString(),
    taskId: normalized.taskId,
    branchName: normalized.branchName,
    worktreePath: normalized.worktreePath,
    releaseMode,
    released: true,
  };

  return createWorktreeReleaseResult({
    ...input,
    branchSafety,
  });
}

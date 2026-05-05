import { createGitBranchName } from '@vannadii/devplat-core';

import {
  GITHUB_ACTION_COMMENT_PR,
  GITHUB_ACTION_CREATE_PR,
  GITHUB_ACTION_MERGE_PR,
  GITHUB_ACTION_UPDATE_PR,
  GITHUB_HTTP_METHOD_PATCH,
  GITHUB_HTTP_METHOD_POST,
  GITHUB_HTTP_METHOD_PUT,
} from './constants.js';
import type {
  GitHubActionRequest,
  GitHubIssueSpecLink,
  GitHubPullRequestState,
  GitHubRepositoryState,
  GitHubRestRequest,
} from './codec.js';

/**
 * Trims optional text and drops blank optional fields.
 */
function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Deduplicates and sorts non-empty strings.
 */
function uniqueTrimmed(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

/**
 * Deduplicates, validates, and sorts Git branch names.
 */
function uniqueGitBranchNames(values: readonly string[]): string[] {
  return uniqueTrimmed(values).map((value) => createGitBranchName(value));
}

/**
 * Deduplicates and sorts numeric identifiers.
 */
function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

/**
 * Reads the pull request number required by pull-request-targeted actions.
 */
function requirePullRequestNumber(input: GitHubActionRequest): number {
  if (typeof input.targetNumber !== 'number') {
    throw new Error(`${input.action} requires targetNumber.`);
  }

  return input.targetNumber;
}

/**
 * Encodes `owner/repo` into a safe GitHub REST path segment pair.
 */
function encodeRepositoryPath(repoFullName: string): string {
  const parts = repoFullName.split('/');
  const owner = parts[0];
  const repo = parts[1];

  if (parts.length !== 2 || owner === undefined || repo === undefined) {
    throw new Error('repoFullName must use owner/repo format.');
  }

  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/**
 * Normalizes a GitHub workflow action request.
 */
export function createGitHubActionRequest(
  input: GitHubActionRequest,
): GitHubActionRequest {
  const branchName = optionalTrimmed(input.branchName);
  const baseBranch = optionalTrimmed(input.baseBranch);
  const title = optionalTrimmed(input.title);
  const body = optionalTrimmed(input.body);
  const commentBody = optionalTrimmed(input.commentBody);
  const expectedHeadSha = optionalTrimmed(input.expectedHeadSha);

  return {
    ...input,
    repoFullName: input.repoFullName.trim(),
    summary: input.summary.trim(),
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(branchName ? { branchName: createGitBranchName(branchName) } : {}),
    ...(baseBranch === undefined
      ? {}
      : { baseBranch: createGitBranchName(baseBranch) }),
    ...(title === undefined ? {} : { title }),
    ...(body === undefined ? {} : { body }),
    ...(commentBody === undefined ? {} : { commentBody }),
    ...(expectedHeadSha === undefined ? {} : { expectedHeadSha }),
  };
}

/**
 * Returns true when the GitHub action requires privileged policy approval.
 */
export function isPrivilegedGitHubAction(input: GitHubActionRequest): boolean {
  return input.privileged || input.action === GITHUB_ACTION_MERGE_PR;
}

/**
 * Describes a GitHub action request for status output.
 */
export function describeGitHubActionRequest(
  input: GitHubActionRequest,
): string {
  return `${input.action} -> ${input.repoFullName}`;
}

/**
 * Normalizes a repository state snapshot.
 */
export function createGitHubRepositoryState(
  input: GitHubRepositoryState,
): GitHubRepositoryState {
  return {
    ...input,
    repoFullName: input.repoFullName.trim(),
    defaultBranch: createGitBranchName(input.defaultBranch),
    protectedBranches: uniqueGitBranchNames(input.protectedBranches),
    openPullRequestNumbers: uniqueNumbers(input.openPullRequestNumbers),
    linkedIssueNumbers: uniqueNumbers(input.linkedIssueNumbers),
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

/**
 * Normalizes a pull request state snapshot.
 */
export function createGitHubPullRequestState(
  input: GitHubPullRequestState,
): GitHubPullRequestState {
  const specId = optionalTrimmed(input.specId);

  return {
    ...input,
    repoFullName: input.repoFullName.trim(),
    title: input.title.trim(),
    headBranch: createGitBranchName(input.headBranch),
    baseBranch: createGitBranchName(input.baseBranch),
    headSha: input.headSha.trim(),
    issueNumbers: uniqueNumbers(input.issueNumbers),
    labels: uniqueTrimmed(input.labels),
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(specId === undefined ? {} : { specId }),
  };
}

/**
 * Normalizes an issue/spec/pull-request link.
 */
export function createGitHubIssueSpecLink(
  input: GitHubIssueSpecLink,
): GitHubIssueSpecLink {
  const threadId = optionalTrimmed(input.threadId);

  return {
    ...input,
    repoFullName: input.repoFullName.trim(),
    specId: input.specId.trim(),
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(threadId === undefined ? {} : { threadId }),
  };
}

/**
 * Describes pull request state for operator-facing output.
 */
export function describeGitHubPullRequestState(
  input: GitHubPullRequestState,
): string {
  return `${input.repoFullName}#${String(input.number)} ${input.state} ${input.headBranch}->${input.baseBranch}`;
}

/**
 * Converts a platform GitHub action request into a concrete REST request.
 */
export function createGitHubRestRequest(
  input: GitHubActionRequest,
): GitHubRestRequest {
  const request = createGitHubActionRequest(input);
  const repoPath = encodeRepositoryPath(request.repoFullName);

  if (request.action === GITHUB_ACTION_CREATE_PR) {
    if (request.branchName === undefined) {
      throw new Error('create-pr requires branchName.');
    }
    if (request.baseBranch === undefined) {
      throw new Error('create-pr requires baseBranch.');
    }

    return {
      method: GITHUB_HTTP_METHOD_POST,
      endpoint: `/repos/${repoPath}/pulls`,
      body: {
        title: request.title ?? request.summary,
        body: request.body ?? request.summary,
        head: request.branchName,
        base: request.baseBranch,
      },
    };
  }

  if (request.action === GITHUB_ACTION_UPDATE_PR) {
    const pullRequestNumber = requirePullRequestNumber(request);
    return {
      method: GITHUB_HTTP_METHOD_PATCH,
      endpoint: `/repos/${repoPath}/pulls/${String(pullRequestNumber)}`,
      body: {
        title: request.title ?? request.summary,
        body: request.body ?? request.summary,
      },
    };
  }

  if (request.action === GITHUB_ACTION_COMMENT_PR) {
    const pullRequestNumber = requirePullRequestNumber(request);
    return {
      method: GITHUB_HTTP_METHOD_POST,
      endpoint: `/repos/${repoPath}/issues/${String(pullRequestNumber)}/comments`,
      body: {
        body: request.commentBody ?? request.body ?? request.summary,
      },
    };
  }

  if (request.action === GITHUB_ACTION_MERGE_PR) {
    const pullRequestNumber = requirePullRequestNumber(request);
    return {
      method: GITHUB_HTTP_METHOD_PUT,
      endpoint: `/repos/${repoPath}/pulls/${String(pullRequestNumber)}/merge`,
      body: {
        commit_title: request.title ?? request.summary,
        commit_message: request.body ?? request.summary,
        ...(request.expectedHeadSha === undefined
          ? {}
          : { sha: request.expectedHeadSha }),
      },
    };
  }

  const pullRequestNumber = requirePullRequestNumber(request);
  return {
    method: GITHUB_HTTP_METHOD_PUT,
    endpoint: `/repos/${repoPath}/pulls/${String(pullRequestNumber)}/update-branch`,
    body:
      request.expectedHeadSha === undefined
        ? {}
        : { expected_head_sha: request.expectedHeadSha },
  };
}

import type { GitHubActionRequest, GitHubRestRequest } from './types.js';

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function requirePullRequestNumber(input: GitHubActionRequest): number {
  if (typeof input.targetNumber !== 'number') {
    throw new Error(`${input.action} requires targetNumber.`);
  }

  return input.targetNumber;
}

function encodeRepositoryPath(repoFullName: string): string {
  const parts = repoFullName.split('/');
  const owner = parts[0];
  const repo = parts[1];

  if (parts.length !== 2 || owner === undefined || repo === undefined) {
    throw new Error('repoFullName must use owner/repo format.');
  }

  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

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
    ...(branchName ? { branchName } : {}),
    ...(baseBranch === undefined ? {} : { baseBranch }),
    ...(title === undefined ? {} : { title }),
    ...(body === undefined ? {} : { body }),
    ...(commentBody === undefined ? {} : { commentBody }),
    ...(expectedHeadSha === undefined ? {} : { expectedHeadSha }),
  };
}

export function isPrivilegedGitHubAction(input: GitHubActionRequest): boolean {
  return input.privileged || input.action === 'merge-pr';
}

export function describeGitHubActionRequest(
  input: GitHubActionRequest,
): string {
  return `${input.action} -> ${input.repoFullName}`;
}

export function createGitHubRestRequest(
  input: GitHubActionRequest,
): GitHubRestRequest {
  const request = createGitHubActionRequest(input);
  const repoPath = encodeRepositoryPath(request.repoFullName);

  if (request.action === 'create-pr') {
    if (request.branchName === undefined) {
      throw new Error('create-pr requires branchName.');
    }

    return {
      method: 'POST',
      endpoint: `/repos/${repoPath}/pulls`,
      body: {
        title: request.title ?? request.summary,
        body: request.body ?? request.summary,
        head: request.branchName,
        base: request.baseBranch ?? 'main',
      },
    };
  }

  if (request.action === 'update-pr') {
    const pullRequestNumber = requirePullRequestNumber(request);
    return {
      method: 'PATCH',
      endpoint: `/repos/${repoPath}/pulls/${String(pullRequestNumber)}`,
      body: {
        title: request.title ?? request.summary,
        body: request.body ?? request.summary,
      },
    };
  }

  if (request.action === 'comment-pr') {
    const pullRequestNumber = requirePullRequestNumber(request);
    return {
      method: 'POST',
      endpoint: `/repos/${repoPath}/issues/${String(pullRequestNumber)}/comments`,
      body: {
        body: request.commentBody ?? request.body ?? request.summary,
      },
    };
  }

  if (request.action === 'merge-pr') {
    const pullRequestNumber = requirePullRequestNumber(request);
    return {
      method: 'PUT',
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
    method: 'PUT',
    endpoint: `/repos/${repoPath}/pulls/${String(pullRequestNumber)}/update-branch`,
    body:
      request.expectedHeadSha === undefined
        ? {}
        : { expected_head_sha: request.expectedHeadSha },
  };
}

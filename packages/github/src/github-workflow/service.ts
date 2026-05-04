import { TelemetryEventService } from '@vannadii/devplat-observability';
import { DecisionPolicyService } from '@vannadii/devplat-policy';

import {
  GITHUB_DEFAULT_API_BASE_URL,
  GITHUB_DRY_RUN_STATUS_CODE,
  GITHUB_HTTP_SUCCESS_MAX_EXCLUSIVE_STATUS_CODE,
  GITHUB_HTTP_SUCCESS_MIN_STATUS_CODE,
  GITHUB_REST_API_VERSION,
  GITHUB_SUBMISSION_MODE_DRY_RUN,
  GITHUB_SUBMISSION_MODE_LIVE,
  GITHUB_WORKFLOW_DEFAULT_ACTOR_ID,
  GITHUB_WORKFLOW_TELEMETRY_ID_PREFIX,
  GITHUB_WORKFLOW_TELEMETRY_SCOPE,
  GITHUB_WORKFLOW_TELEMETRY_TRACE,
} from './constants.js';
import {
  createGitHubActionRequest,
  createGitHubIssueSpecLink,
  createGitHubPullRequestState,
  createGitHubRepositoryState,
  createGitHubRestRequest,
  describeGitHubActionRequest,
  isPrivilegedGitHubAction,
} from './logic.js';
import type {
  GitHubAction,
  GitHubActionDecision,
  GitHubActionRequest,
  GitHubIssueSpecLink,
  GitHubPullRequestState,
  GitHubRepositoryState,
  GitHubSubmissionMode,
  GitHubSubmissionReceipt,
} from './codec.js';

/**
 * Returns whether a receipt represents a submitted or intentionally simulated request.
 */
function isSubmittedGitHubReceipt(receipt: GitHubSubmissionReceipt): boolean {
  return (
    receipt.statusCode === GITHUB_DRY_RUN_STATUS_CODE ||
    (receipt.statusCode >= GITHUB_HTTP_SUCCESS_MIN_STATUS_CODE &&
      receipt.statusCode < GITHUB_HTTP_SUCCESS_MAX_EXCLUSIVE_STATUS_CODE)
  );
}

/**
 * Creates the persisted telemetry event identifier for a GitHub action.
 */
function createGitHubWorkflowTelemetryEventId(action: GitHubAction): string {
  return `${GITHUB_WORKFLOW_TELEMETRY_ID_PREFIX}:${action}:${String(Date.now())}`;
}

/**
 * Transport boundary for GitHub REST submissions.
 */
export interface GitHubRestTransport {
  /**
   * Submits or simulates a GitHub action request.
   */
  submit(input: GitHubActionRequest): Promise<GitHubSubmissionReceipt>;
}

/**
 * GitHub REST transport that supports live and dry-run submission modes.
 */
export class GitHubRestApiTransport implements GitHubRestTransport {
  /**
   * Creates a GitHub REST transport from environment defaults or overrides.
   */
  public constructor(
    private readonly token = process.env['GITHUB_TOKEN'] ?? '',
    private readonly baseUrl = process.env['GITHUB_API_BASE_URL'] ??
      GITHUB_DEFAULT_API_BASE_URL,
    private readonly fetchImpl = fetch,
    private readonly mode: GitHubSubmissionMode = token.trim().length > 0
      ? GITHUB_SUBMISSION_MODE_LIVE
      : GITHUB_SUBMISSION_MODE_DRY_RUN,
  ) {}

  /**
   * Submits a normalized GitHub request or returns the dry-run request receipt.
   */
  public async submit(
    input: GitHubActionRequest,
  ): Promise<GitHubSubmissionReceipt> {
    const request = createGitHubRestRequest(input);
    if (this.mode === GITHUB_SUBMISSION_MODE_DRY_RUN) {
      return {
        method: request.method,
        endpoint: request.endpoint,
        statusCode: 0,
        responseBody: {
          dryRun: true,
          request,
        },
      };
    }

    if (this.token.trim().length === 0) {
      throw new Error('GITHUB_TOKEN is required for GitHub API submission.');
    }

    const response = await this.fetchImpl(
      `${this.baseUrl}${request.endpoint}`,
      {
        method: request.method,
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${this.token}`,
          'content-type': 'application/json',
          'x-github-api-version': GITHUB_REST_API_VERSION,
        },
        body: JSON.stringify(request.body),
      },
    );
    const responseBody: unknown = await response.json().catch(() => null);

    return {
      method: request.method,
      endpoint: request.endpoint,
      statusCode: response.status,
      responseBody,
    };
  }
}

/**
 * Policy-aware GitHub workflow service with telemetry recording.
 */
export class GitHubWorkflowService {
  /**
   * Creates the GitHub workflow service with policy, telemetry, and transport.
   */
  public constructor(
    private readonly policy = new DecisionPolicyService(),
    private readonly telemetry = new TelemetryEventService(),
    private readonly transport: GitHubRestTransport = new GitHubRestApiTransport(),
  ) {}

  /**
   * Normalizes a GitHub action request before policy evaluation or submission.
   */
  public prepare(input: GitHubActionRequest): GitHubActionRequest {
    return createGitHubActionRequest(input);
  }

  /**
   * Normalizes repository state from GitHub.
   */
  public normalizeRepositoryState(
    input: GitHubRepositoryState,
  ): GitHubRepositoryState {
    return createGitHubRepositoryState(input);
  }

  /**
   * Normalizes pull request state from GitHub.
   */
  public normalizePullRequestState(
    input: GitHubPullRequestState,
  ): GitHubPullRequestState {
    return createGitHubPullRequestState(input);
  }

  /**
   * Normalizes a GitHub issue to spec and pull request link.
   */
  public linkIssueToSpecPr(input: GitHubIssueSpecLink): GitHubIssueSpecLink {
    return createGitHubIssueSpecLink(input);
  }

  /**
   * Evaluates policy, records telemetry, and submits an allowed GitHub action.
   */
  public async submit(
    input: GitHubActionRequest,
    actorId = GITHUB_WORKFLOW_DEFAULT_ACTOR_ID,
  ): Promise<GitHubActionDecision> {
    const request = createGitHubActionRequest(input);
    const telemetryEventId = createGitHubWorkflowTelemetryEventId(
      request.action,
    );
    const decision = this.policy.evaluateControlAction(
      request.action,
      isPrivilegedGitHubAction(request),
    );

    await this.telemetry.record({
      id: telemetryEventId,
      summary: request.summary,
      status: decision.allowed ? 'approved' : 'blocked',
      trace: [GITHUB_WORKFLOW_TELEMETRY_TRACE],
      updatedAt: request.updatedAt,
      actorId,
      action: `github:${request.action}`,
      scope: GITHUB_WORKFLOW_TELEMETRY_SCOPE,
      details: {
        repoFullName: request.repoFullName,
        targetNumber: request.targetNumber ?? null,
        branchName: request.branchName ?? null,
      },
    });

    if (!decision.allowed) {
      return {
        request,
        allowed: decision.allowed,
        policyDecisionId: decision.id,
        telemetryEventId,
        submitted: false,
      };
    }

    const receipt = await this.transport.submit(request);

    return {
      request,
      allowed: decision.allowed,
      policyDecisionId: decision.id,
      telemetryEventId,
      submitted: isSubmittedGitHubReceipt(receipt),
      receipt,
    };
  }

  /**
   * Describes a GitHub action for operator-facing output.
   */
  public explain(input: GitHubActionRequest): string {
    return describeGitHubActionRequest(input);
  }
}

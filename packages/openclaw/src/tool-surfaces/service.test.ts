import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createApproveSpecRecordTool,
  createAllocateWorktreeTool,
  createApprovalRecordTool,
  createArtifactEnvelopeTool,
  createAuditLogTool,
  createBindDiscordThreadTool,
  createClaimTaskTool,
  createExecuteRebaseDependentsTool,
  createEvaluateSlicePlanReadinessTool,
  createExecuteCommandTool,
  createEvaluatePolicyActionTool,
  createEvaluateSonarQualityGateTool,
  createMergeDecisionTool,
  createOpenClawPluginConfigTool,
  createReleaseWorktreeTool,
  createRemediationPlanTool,
  createRememberMemoryEntryTool,
  createRecordTelemetryEventTool,
  createReadStoredRecordTool,
  createRebaseResultTool,
  createReviewFindingTool,
  createHandleDiscordApprovalTool,
  createHandleDiscordControlTool,
  createListStoredRecordsTool,
  createOpenDiscordThreadTool,
  createResolveRuntimeConfigTool,
  createPlanRebaseDependentsTool,
  createPullRequestRecordTool,
  createResearchBriefTool,
  createRunGatesTool,
  createRunSupervisorStepTool,
  createSlicePlanTool,
  createSpecRecordTool,
  createStoreRecordTool,
  createGitHubActionRequestTool,
  createSubmitGitHubActionTool,
  createSubmitPullRequestMergeTool,
  createSubmitPullRequestUpdateTool,
  createSyncWorktreeTool,
  createTaskRecordTool,
  createUpdateTaskTool,
  createUpdateSpecRecordTool,
  createValidateArtifactTool,
  createVerifySonarBootstrapTool,
} from './service.js';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('tool surface service', () => {
  it('creates OpenClaw-compatible tool definitions', async () => {
    const tool = createRunGatesTool({
      async run(gateNames, summary) {
        return {
          id: 'gate-run-report',
          summary,
          status: 'complete',
          trace: ['gates:passed'],
          updatedAt: '2026-04-04T00:00:00.000Z',
          passed: true,
          results: gateNames.map((gateName) => ({
            name: gateName,
            success: true,
            detail: `${gateName} -> exit 0`,
          })),
        };
      },
    });
    expect(tool.name).toBe('run_gates');
    const result = await tool.execute('tool-call-1', {
      gateNames: ['lint'],
      summary: 'run lint',
    });
    expect(result.details).toMatchObject({
      passed: true,
      results: [{ name: 'lint', success: true }],
    });
  });

  it('fails closed when a generated tool schema is not a JSON object', async () => {
    vi.resetModules();
    vi.doMock('node:fs', () => ({
      readFileSync() {
        return '[]';
      },
    }));

    const serviceModule = await import('./service.js');

    expect(() => serviceModule.createRunGatesTool()).toThrow(
      'Schema tool-run-gates-params.schema.json must contain a JSON object.',
    );
  });

  it('creates research brief artifacts from valid tool input', async () => {
    const result = await createResearchBriefTool().execute('tool-call-r1', {
      researchId: 'research-1',
      topic: ' Discord-first workflows ',
      question: 'What should Phase 0 expose?',
      constraints: ['auditability', 'auditability'],
      findings: ['thread isolation'],
      recommendation: 'Expose thread-aware tools.',
      sourceUrls: ['https://example.com/openclaw'],
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'research-brief',
      payload: { topic: 'Discord-first workflows' },
    });
  });

  it('returns decode failures for invalid research brief input', async () => {
    const result = await createResearchBriefTool().execute('tool-call-r2', {
      researchId: 'research-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates spec record artifacts from valid tool input', async () => {
    const result = await createSpecRecordTool().execute('tool-call-s1', {
      specId: 'spec-1',
      researchId: 'research-1',
      title: ' Discord approval flow ',
      objective: 'Add explicit approval routing.',
      acceptanceCriteria: ['policy check', 'audit artifact'],
      approvalState: 'review',
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'spec-record',
      payload: { title: 'Discord approval flow' },
    });
  });

  it('returns decode failures for invalid spec record input', async () => {
    const result = await createSpecRecordTool().execute('tool-call-s2', {
      specId: 'spec-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('approves spec record artifacts from valid tool input', async () => {
    const result = await createApproveSpecRecordTool().execute('tool-call-s3', {
      specId: 'spec-1',
      researchId: 'research-1',
      title: ' Discord approval flow ',
      objective: 'Add explicit approval routing.',
      acceptanceCriteria: ['policy check', 'audit artifact'],
      approvalState: 'review',
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'spec-record',
      status: 'approved',
      payload: {
        title: 'Discord approval flow',
        approvalState: 'approved',
      },
    });
  });

  it('returns decode failures for invalid spec approval input', async () => {
    const result = await createApproveSpecRecordTool().execute('tool-call-s4', {
      specId: 'spec-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('updates spec records from valid tool input', async () => {
    const result = await createUpdateSpecRecordTool().execute('tool-call-s5', {
      specId: 'spec-1',
      researchId: 'research-1',
      title: ' Discord approval flow ',
      objective: 'Add explicit approval routing.',
      acceptanceCriteria: ['policy check', 'audit artifact'],
      approvalState: 'approved',
      version: 2,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'spec-record',
      payload: {
        approvalState: 'review',
        version: 3,
      },
    });
  });

  it('returns decode failures for invalid spec revision input', async () => {
    const result = await createUpdateSpecRecordTool().execute('tool-call-s6', {
      specId: 'spec-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates slice plans from valid tool input', async () => {
    const result = await createSlicePlanTool().execute('tool-call-sl1', {
      sliceId: 'slice-1',
      specId: 'spec-1',
      title: ' Wire Discord controls ',
      dependsOn: ['slice-0'],
      acceptanceCriteria: ['control persisted'],
      doneConditions: ['tests pass'],
      size: 'small',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      sliceId: 'slice-1',
      title: 'Wire Discord controls',
    });
  });

  it('returns decode failures for invalid slice plan input', async () => {
    const result = await createSlicePlanTool().execute('tool-call-sl2', {
      sliceId: 'slice-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('evaluates slice plan readiness from valid tool input', async () => {
    const result = await createEvaluateSlicePlanReadinessTool().execute(
      'tool-call-sl3',
      {
        plan: {
          sliceId: 'slice-2',
          specId: 'spec-1',
          title: ' Wire Discord controls ',
          dependsOn: ['slice-0', 'slice-1'],
          acceptanceCriteria: ['control persisted'],
          doneConditions: ['tests pass'],
          size: 'small',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        completedSliceIds: ['slice-0', 'slice-1'],
      },
    );

    expect(result.details).toMatchObject({
      ready: true,
      completedSliceIds: ['slice-0', 'slice-1'],
      plan: {
        title: 'Wire Discord controls',
      },
    });
  });

  it('returns decode failures for invalid slice readiness input', async () => {
    const result = await createEvaluateSlicePlanReadinessTool().execute(
      'tool-call-sl4',
      {
        completedSliceIds: ['slice-0'],
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('resolves runtime config from valid tool input', async () => {
    const result = await createResolveRuntimeConfigTool().execute(
      'tool-call-cfg1',
      {
        env: {
          GITHUB_OWNER: 'VannaDii',
          GITHUB_REPO: 'devplat',
          DISCORD_API_BASE_URL: 'https://discord.com/api/v10',
          DISCORD_APPLICATION_ID: 'application-1',
          DISCORD_PUBLIC_KEY: 'public-key-1',
          DISCORD_BOT_TOKEN: 'bot-token-1',
          DISCORD_DEFAULT_GUILD_ID: 'guild-1',
          DISCORD_SPEC_CHANNEL_ID: 'spec-1',
          DISCORD_IMPLEMENTATION_CHANNEL_ID: 'impl-1',
          DISCORD_PULL_REQUEST_CHANNEL_ID: 'pr-1',
          DISCORD_AUDIT_CHANNEL_ID: 'audit-1',
          DISCORD_PROJECT_MANAGEMENT_CHANNEL_ID: 'pm-1',
          OPENCLAW_PLUGIN_ID: '@vannadii/devplat-openclaw',
          SONAR_ORGANIZATION: 'vannadii',
          SONAR_PROJECT_KEY: 'vannadii_devplat',
        },
      },
    );

    expect(result.details).toMatchObject({
      githubOwner: 'VannaDii',
      githubRepo: 'devplat',
      discord: {
        apiBaseUrl: 'https://discord.com/api/v10',
        apiVersion: 'v10',
        applicationId: 'application-1',
        publicKey: '[redacted]',
        botToken: '[redacted]',
        installScopes: ['bot', 'applications.commands'],
        defaultGuildId: 'guild-1',
        specChannelId: 'spec-1',
        requiredPermissions: [
          'ViewChannel',
          'SendMessages',
          'CreatePublicThreads',
          'CreatePrivateThreads',
          'SendMessagesInThreads',
          'ManageThreads',
          'ReadMessageHistory',
        ],
      },
      sonar: {
        projectKey: 'vannadii_devplat',
        minimumCoverage: 90,
      },
    });
  });

  it('returns decode failures for invalid runtime config input', async () => {
    const result = await createResolveRuntimeConfigTool().execute(
      'tool-call-cfg2',
      {
        env: {
          GITHUB_OWNER: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates OpenClaw plugin config from valid runtime config', async () => {
    const result = await createOpenClawPluginConfigTool().execute(
      'tool-call-cfg3',
      {
        id: 'devplat-config',
        summary: 'Runtime config',
        status: 'approved',
        trace: ['config:resolved'],
        updatedAt: '2026-04-04T00:00:00.000Z',
        githubOwner: 'VannaDii',
        githubRepo: 'devplat',
        repository: {
          owner: 'VannaDii',
          repo: 'devplat',
          defaultBranch: 'main',
          repositoryKey: 'VannaDii/devplat',
        },
        github: {
          apiBaseUrl: 'https://api.github.com',
          webBaseUrl: 'https://github.com',
          tokenEnvironmentVariable: 'GITHUB_TOKEN',
        },
        storage: {
          rootDirectory: '.devplat',
          layoutVersion: 1,
          artifactDirectory: '.devplat/artifacts',
          indexDirectory: '.devplat/indexes',
          auditLogDirectory: '.devplat/audit',
        },
        worktrees: {
          rootDirectory: '.devplat/worktrees',
          baseBranch: 'main',
          syncStrategy: 'rebase-or-fast-forward',
        },
        deployment: {
          target: 'local-docker',
          dockerImageRepository: 'ghcr.io/vannadii/devplat-openclaw-runtime',
          dockerImageTag: 'latest',
          helmReleaseName: 'devplat',
          helmNamespace: 'devplat',
          helmChartPath: 'deploy/helm/devplat',
          stateMountPath: '/var/lib/devplat',
        },
        discord: {
          apiBaseUrl: 'https://discord.com/api/v10',
          apiVersion: 'v10',
          applicationId: 'application-1',
          publicKey: '[redacted]',
          botToken: '[redacted]',
          installScopes: ['bot', 'applications.commands'],
          requiredPermissions: [
            'ViewChannel',
            'SendMessages',
            'CreatePublicThreads',
            'CreatePrivateThreads',
            'SendMessagesInThreads',
            'ManageThreads',
            'ReadMessageHistory',
          ],
          defaultGuildId: 'guild-1',
          specChannelId: 'spec-1',
          implementationChannelId: 'impl-1',
          pullRequestChannelId: 'pr-1',
          auditChannelId: 'audit-1',
          projectManagementChannelId: 'pm-1',
          threadBindingMode: 'inherit-parent',
        },
        openclaw: {
          pluginId: '@vannadii/devplat-openclaw',
          gateway: {
            bind: 'loopback',
            port: 18789,
            authMode: 'token',
          },
          actionGates: {
            approveThis: true,
            mergeNow: false,
            retryGates: true,
            rebaseAllDependents: true,
          },
        },
        sonar: {
          organization: 'vannadii',
          projectKey: 'vannadii_devplat',
          minimumCoverage: 90,
        },
      },
    );

    expect(result.details).toMatchObject({
      id: '@vannadii/devplat-openclaw:config',
      apiVersion: 'v10',
      defaultGuildId: 'guild-1',
      specChannelId: 'spec-1',
      implementationChannelId: 'impl-1',
      pullRequestChannelId: 'pr-1',
      auditChannelId: 'audit-1',
      projectManagementChannelId: 'pm-1',
      actionGates: {
        approveThis: true,
        mergeNow: false,
        retryGates: true,
        rebaseAllDependents: true,
      },
    });
  });

  it('returns decode failures for invalid OpenClaw plugin config input', async () => {
    const result = await createOpenClawPluginConfigTool().execute(
      'tool-call-cfg4',
      {
        id: 'devplat-config',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates artifact envelopes from valid tool input', async () => {
    const result = await createArtifactEnvelopeTool().execute('tool-call-ae1', {
      id: 'artifact-generic-1',
      artifactType: 'audit-log',
      version: 1,
      summary: ' Generic audit artifact ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        actorId: 'operator-1',
      },
    });

    expect(result.details).toMatchObject({
      id: 'artifact-generic-1',
      artifactType: 'audit-log',
      summary: 'Generic audit artifact',
      trace: ['artifact:audit-log'],
    });
  });

  it('returns decode failures for invalid artifact envelope input', async () => {
    const result = await createArtifactEnvelopeTool().execute('tool-call-ae2', {
      id: 'artifact-generic-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates approval record artifacts from valid tool input', async () => {
    const result = await createApprovalRecordTool().execute('tool-call-ap1', {
      id: 'artifact-approval-1',
      artifactType: 'approval-record',
      version: 1,
      summary: ' Approve slice ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        approvalId: ' approval-1 ',
        subjectType: 'slice',
        subjectId: ' slice-1 ',
        actorId: ' operator-1 ',
        decision: 'approved',
        rationale: ' Ready to proceed ',
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'approval-record',
      summary: 'Approve slice',
      payload: {
        approvalId: 'approval-1',
        subjectId: 'slice-1',
        actorId: 'operator-1',
      },
    });
  });

  it('creates audit log artifacts from valid tool input', async () => {
    const result = await createAuditLogTool().execute('tool-call-al1', {
      id: 'artifact-audit-1',
      artifactType: 'audit-log',
      version: 1,
      summary: ' Retry gates ',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        auditId: ' audit-1 ',
        actorId: ' operator-1 ',
        action: 'retry-gates',
        scope: 'discord',
        details: {
          threadId: 'thread-1',
        },
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'audit-log',
      summary: 'Retry gates',
      payload: {
        auditId: 'audit-1',
        actorId: 'operator-1',
      },
    });
  });

  it('creates merge decision artifacts from valid tool input', async () => {
    const result = await createMergeDecisionTool().execute('tool-call-md1', {
      id: 'artifact-merge-1',
      artifactType: 'merge-decision',
      version: 1,
      summary: ' Merge decision ',
      status: 'approved',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        decisionId: ' merge-1 ',
        prNumber: 42,
        actorId: ' operator-1 ',
        mergeStrategy: 'squash',
        approved: true,
        rationale: ' Ready to merge ',
        blockingFindings: [' none '],
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'merge-decision',
      summary: 'Merge decision',
      payload: {
        decisionId: 'merge-1',
        actorId: 'operator-1',
        blockingFindings: ['none'],
      },
    });
  });

  it('creates rebase result artifacts from valid tool input', async () => {
    const result = await createRebaseResultTool().execute('tool-call-rb1', {
      id: 'artifact-rebase-1',
      artifactType: 'rebase-result',
      version: 1,
      summary: ' Rebase result ',
      status: 'complete',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      payload: {
        resultId: ' rebase-1 ',
        mergedPrNumber: 42,
        baseBranch: ' main ',
        branchName: ' feature/x ',
        rebased: true,
        conflictsDetected: false,
        details: ' Rebased cleanly ',
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'rebase-result',
      summary: 'Rebase result',
      payload: {
        resultId: 'rebase-1',
        baseBranch: 'main',
        branchName: 'feature/x',
      },
    });
  });

  it('returns decode failures for invalid approval record input', async () => {
    const result = await createApprovalRecordTool().execute('tool-call-ap2', {
      id: 'artifact-approval-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid audit log input', async () => {
    const result = await createAuditLogTool().execute('tool-call-al2', {
      id: 'artifact-audit-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid merge decision input', async () => {
    const result = await createMergeDecisionTool().execute('tool-call-md2', {
      id: 'artifact-merge-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid rebase result input', async () => {
    const result = await createRebaseResultTool().execute('tool-call-rb2', {
      id: 'artifact-rebase-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('executes commands from valid non-privileged tool input', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex1', {
      command: process.execPath,
      args: [
        '-e',
        'process.stdout.write(process.env.DEVPLAT_TEST_VALUE ?? "")',
      ],
      actorId: 'operator-1',
      privileged: false,
      env: {
        DEVPLAT_TEST_VALUE: 'ok',
      },
    });

    expect(result.details).toMatchObject({
      allowed: true,
      policyDecisionId: 'policy-execute-command',
      result: {
        exitCode: 0,
        stdout: 'ok',
      },
    });
  });

  it('blocks privileged command execution requests', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex2', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("blocked")'],
      actorId: 'operator-1',
      privileged: true,
    });

    expect(result.details).toMatchObject({
      allowed: false,
      policyDecisionId: 'policy-execute-command',
      request: {
        command: process.execPath,
      },
    });
  });

  it('rejects absolute cwd values for command execution', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex3', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("bad")'],
      actorId: 'operator-1',
      privileged: false,
      cwd: process.cwd(),
    });

    expect(result.details).toMatchObject({
      status: 'failed',
      error: 'cwd must be a relative repository path.',
    });
  });

  it('accepts blank cwd values for command execution', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex5', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("blank-cwd")'],
      actorId: 'operator-1',
      privileged: false,
      cwd: '   ',
    });

    expect(result.details).toMatchObject({
      allowed: true,
      request: {
        cwd: null,
        timeoutMs: null,
      },
      result: {
        exitCode: 0,
        stdout: 'blank-cwd',
        timedOut: false,
      },
    });
  });

  it('rejects cwd traversal outside the repository root', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex6', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("bad")'],
      actorId: 'operator-1',
      privileged: false,
      cwd: '../outside',
    });

    expect(result.details).toMatchObject({
      status: 'failed',
      error: 'cwd must stay within the repository root.',
    });
  });

  it('records failed command execution results when timeouts are exceeded', async () => {
    const result = await createExecuteCommandTool({
      commandExecutionService: {
        async execute() {
          return {
            command: process.execPath,
            args: ['-e', 'setTimeout(() => {}, 1_000)'],
            cwd: 'packages',
            exitCode: 124,
            stdout: '',
            stderr: '',
            timedOut: true,
          };
        },
      },
      telemetryEventService: {
        async record() {
          return {
            id: 'telemetry-1',
            summary: 'Executed timeout command',
            status: 'failed',
            trace: ['openclaw:execute-command'],
            updatedAt: '2026-04-05T00:00:00.000Z',
            actorId: 'operator-1',
            action: 'execute-command',
            scope: 'supervisor',
            details: {
              timedOut: true,
            },
          };
        },
      },
    }).execute('tool-call-ex7', {
      command: process.execPath,
      args: ['-e', 'setTimeout(() => {}, 1_000)'],
      actorId: 'operator-1',
      privileged: false,
      cwd: 'packages',
      timeoutMs: 25,
    });

    expect(result.details).toMatchObject({
      allowed: true,
      request: {
        cwd: 'packages',
        timeoutMs: 25,
      },
      result: {
        exitCode: 124,
        timedOut: true,
      },
    });
  });

  it('returns decode failures for invalid command execution input', async () => {
    const result = await createExecuteCommandTool().execute('tool-call-ex4', {
      command: process.execPath,
      args: ['-e', 'process.stdout.write("bad")'],
      privileged: false,
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid run_gates input', async () => {
    const result = await createRunGatesTool().execute('tool-call-2', {
      gateNames: 'lint',
      summary: 'run lint',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('allocates worktrees from valid tool input', async () => {
    const result = await createAllocateWorktreeTool().execute('tool-call-3', {
      taskId: 'task-1',
      branchName: 'feature/task-1',
    });

    expect(result.details).toMatchObject({ taskId: 'task-1' });
  });

  it('syncs worktrees from valid tool input', async () => {
    const result = await createSyncWorktreeTool().execute('tool-call-3a', {
      allocation: {
        id: 'worktree-task-1',
        summary: 'allocated worktree',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        taskId: 'task-1',
        branchName: 'feature/task-1',
        worktreePath: '.worktrees/feature/task-1',
      },
      baseBranch: 'main',
      syncMode: 'fast-forward',
    });

    expect(result.details).toMatchObject({
      taskId: 'task-1',
      baseBranch: 'main',
      syncMode: 'fast-forward',
    });
  });

  it('releases worktrees from valid tool input', async () => {
    const result = await createReleaseWorktreeTool().execute('tool-call-3b', {
      allocation: {
        id: 'worktree-task-1',
        summary: 'allocated worktree',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        taskId: 'task-1',
        branchName: 'feature/task-1',
        worktreePath: '.worktrees/feature/task-1',
      },
      releaseMode: 'delete',
    });

    expect(result.details).toMatchObject({
      taskId: 'task-1',
      releaseMode: 'delete',
      released: true,
    });
  });

  it('returns decode failures for invalid worktree release input', async () => {
    const result = await createReleaseWorktreeTool().execute('tool-call-3c', {
      allocation: {
        id: 'worktree-task-1',
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('binds Discord threads from valid tool input', async () => {
    const result = await createBindDiscordThreadTool().execute(
      'tool-call-db1',
      {
        id: 'binding-1',
        summary: 'Bind spec thread',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1',
        kind: 'spec',
        threadBindingMode: 'inherit-parent',
        threadId: 'thread-1',
        parentChannelId: 'channel-1',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      threadId: 'thread-1',
      routingKey: 'guild-1:spec:thread-1',
    });
  });

  it('returns decode failures for invalid Discord binding input', async () => {
    const result = await createBindDiscordThreadTool().execute(
      'tool-call-db2',
      {
        id: 'binding-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('opens Discord thread sessions from valid tool input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt1',
      {
        id: 'session-1',
        summary: 'Spec thread',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1',
        parentChannelId: 'parent-1',
        threadId: 'thread-1',
        kind: 'spec',
        specId: 'spec-1',
        sliceId: null,
        pullRequestNumber: null,
        artifactId: 'artifact-1',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      artifactId: 'artifact-1',
      persistedKey: 'session-1',
    });
  });

  it('opens implementation Discord thread sessions from valid tool input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt1b',
      {
        id: 'session-1b',
        summary: 'Implementation thread',
        status: 'running',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1b',
        parentChannelId: 'parent-1b',
        threadId: 'thread-1b',
        kind: 'implementation',
        specId: 'spec-1',
        sliceId: 'slice-1',
        pullRequestNumber: null,
        artifactId: 'artifact-1b',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      artifactId: 'artifact-1b',
      persistedKey: 'session-1b',
    });
  });

  it('opens pull-request Discord thread sessions from valid tool input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt1c',
      {
        id: 'session-1c',
        summary: 'Pull request thread',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        guildId: 'guild-1',
        channelId: 'channel-1c',
        parentChannelId: 'parent-1c',
        threadId: 'thread-1c',
        kind: 'pull-request',
        specId: null,
        sliceId: null,
        pullRequestNumber: 14,
        artifactId: 'artifact-1c',
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      artifactId: 'artifact-1c',
      persistedKey: 'session-1c',
    });
  });

  it('returns decode failures for invalid Discord thread input', async () => {
    const result = await createOpenDiscordThreadTool().execute(
      'tool-call-dt2',
      {
        id: 'session-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid worktree input', async () => {
    const result = await createAllocateWorktreeTool().execute('tool-call-4', {
      taskId: 'task-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid worktree sync input', async () => {
    const result = await createSyncWorktreeTool().execute('tool-call-4a', {
      allocation: {
        id: 'worktree-task-1',
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('claims queued tasks from valid tool input', async () => {
    const result = await createClaimTaskTool().execute('tool-call-5', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
      assigneeId: 'worker-1',
    });

    expect(result.details).toMatchObject({
      status: 'claimed',
      assigneeId: 'worker-1',
    });
  });

  it('returns decode failures for invalid claim input', async () => {
    const result = await createClaimTaskTool().execute('tool-call-6', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('handles Discord approvals from valid tool input', async () => {
    const result = await createHandleDiscordApprovalTool().execute(
      'tool-call-da1',
      {
        id: 'approval-1',
        summary: 'Approve this',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        actorId: 'operator-1',
        channelId: 'channel-1',
        threadId: 'thread-1',
        action: 'approve',
        artifactId: 'artifact-1',
        privileged: true,
      },
    );

    expect(result.details).toMatchObject({
      allowed: false,
      policyDecisionId: 'policy-approve-this',
    });
  });

  it('returns decode failures for invalid Discord approval input', async () => {
    const result = await createHandleDiscordApprovalTool().execute(
      'tool-call-da2',
      {
        id: 'approval-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('handles Discord control actions from valid tool input', async () => {
    const result = await createHandleDiscordControlTool().execute(
      'tool-call-dc1',
      {
        id: 'control-1',
        summary: 'Retry gates',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        actorId: 'operator-1',
        threadId: 'thread-1',
        channelId: 'channel-1',
        action: 'retry-gates',
        privileged: false,
      },
    );

    expect(result.details).toMatchObject({
      allowed: true,
      policyDecisionId: 'policy-retry-gates',
    });
  });

  it('returns decode failures for invalid Discord control input', async () => {
    const result = await createHandleDiscordControlTool().execute(
      'tool-call-dc2',
      {
        id: 'control-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('verifies Sonar bootstrap state from valid tool input', async () => {
    const result = await createVerifySonarBootstrapTool().execute(
      'tool-call-sb1',
      {
        projectKey: 'vannadii_devplat',
        qualityGateStatus: 'OK',
        conditions: [
          {
            metricKey: 'coverage',
            comparator: 'LT',
            errorThreshold: '90',
            actualValue: '99.69',
          },
          {
            metricKey: 'new_coverage',
            comparator: 'LT',
            errorThreshold: '90',
            actualValue: '100',
          },
        ],
        evaluatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      projectKey: 'vannadii_devplat',
      status: 'passed',
      checks: {
        qualityGateComputed: true,
        qualityGatePassing: true,
        overallCoverageCondition: true,
        newCodeCoverageCondition: true,
      },
    });
  });

  it('returns decode failures for invalid Sonar bootstrap input', async () => {
    const result = await createVerifySonarBootstrapTool().execute(
      'tool-call-sb2',
      {
        projectKey: 'vannadii_devplat',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('evaluates Sonar quality gates from valid tool input', async () => {
    const result = await createEvaluateSonarQualityGateTool().execute(
      'tool-call-sq1',
      {
        projectKey: 'vannadii_devplat',
        overallCoverage: 91,
        newCodeCoverage: 92,
        blockingIssues: 0,
      },
    );

    expect(result.details).toMatchObject({
      projectKey: 'vannadii_devplat',
      status: 'passed',
    });
  });

  it('returns decode failures for invalid Sonar quality gate input', async () => {
    const result = await createEvaluateSonarQualityGateTool().execute(
      'tool-call-sq2',
      {
        projectKey: 'vannadii_devplat',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates review finding artifacts from valid tool input', async () => {
    const result = await createReviewFindingTool().execute('tool-call-rf1', {
      findingId: 'finding-1',
      severity: 'high',
      path: 'packages/openclaw/src/tool-surfaces/service.ts',
      message: 'Missing policy mediation.',
      rationale: 'Privileged actions must stay policy-aware.',
      fixRecommendation: 'Delegate through the policy service.',
      blocking: true,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    expect(result.details).toMatchObject({
      artifactType: 'review-finding',
      payload: { findingId: 'finding-1' },
    });
  });

  it('returns decode failures for invalid review finding input', async () => {
    const result = await createReviewFindingTool().execute('tool-call-rf2', {
      findingId: 'finding-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates remediation plans from valid tool input', async () => {
    const result = await createRemediationPlanTool().execute('tool-call-rp1', {
      findings: [
        {
          findingId: 'finding-1',
          severity: 'medium',
          path: 'packages/openclaw/src/tool-surfaces/service.ts',
          message: 'Add test coverage.',
          rationale: 'The adapter needs direct surface tests.',
          fixRecommendation: 'Add a focused service test.',
          blocking: false,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      ],
      autofix: true,
    });

    expect(result.details).toMatchObject({
      findingIds: ['finding-1'],
      autofix: true,
    });
  });

  it('returns decode failures for invalid remediation input', async () => {
    const result = await createRemediationPlanTool().execute('tool-call-rp2', {
      findings: {},
      autofix: true,
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('persists memory entries from valid tool input', async () => {
    const result = await createRememberMemoryEntryTool().execute(
      'tool-call-me1',
      {
        memoryId: 'memory-openclaw-1',
        kind: 'decision',
        subject: ' Use Discord as the primary control plane ',
        detail: ' Keep the operator flow auditable and thread-scoped. ',
        tags: ['discord', 'discord', ' audit '],
        status: 'active',
        sourceArtifactId: 'artifact-1',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      memoryId: 'memory-openclaw-1',
      subject: 'Use Discord as the primary control plane',
      tags: ['discord', 'audit'],
    });
  });

  it('returns decode failures for invalid memory entry input', async () => {
    const result = await createRememberMemoryEntryTool().execute(
      'tool-call-me2',
      {
        memoryId: 'memory-openclaw-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('evaluates policy actions from valid tool input', async () => {
    const cases = [
      {
        name: 'returns lifecycle policy metadata for merge requests',
        inputs: {
          params: {
            action: 'merge-now',
            privileged: false,
          },
        },
        mock: () => undefined,
        assert: async (
          _context: undefined,
          inputs: {
            params: {
              action: string;
              privileged: boolean;
            };
          },
        ) => {
          const result = await createEvaluatePolicyActionTool().execute(
            'tool-call-pa1',
            inputs.params,
          );

          expect(result.details).toMatchObject({
            action: 'merge-now',
            actionCategory: 'merge',
            allowed: false,
            auditRequired: true,
            escalationRequired: true,
            escalationTarget: 'operator',
            nextAction: 'request-merge-approval',
            privileged: false,
            requiresApproval: true,
            riskLevel: 'high',
          });
          expect(result.details).toHaveProperty('auditReason');
        },
      },
    ];

    for (const testCase of cases) {
      const context = testCase.mock();
      await testCase.assert(context, testCase.inputs);
    }
  });

  it('returns decode failures for invalid policy action input', async () => {
    const result = await createEvaluatePolicyActionTool().execute(
      'tool-call-pa2',
      {
        action: 'merge-now',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('records telemetry events from valid tool input', async () => {
    const result = await createRecordTelemetryEventTool().execute(
      'tool-call-te1',
      {
        id: 'telemetry-openclaw-1',
        summary: ' Sync branch telemetry ',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        actorId: 'operator-1',
        action: 'sync-branch',
        scope: 'github',
        details: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({
      id: 'telemetry-openclaw-1',
      summary: 'Sync branch telemetry',
      trace: ['telemetry:github:sync-branch'],
    });
  });

  it('returns decode failures for invalid telemetry input', async () => {
    const result = await createRecordTelemetryEventTool().execute(
      'tool-call-te2',
      {
        id: 'telemetry-openclaw-1',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('updates task lifecycle state from valid tool input', async () => {
    const result = await createUpdateTaskTool().execute('tool-call-7', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
      status: 'merged',
    });

    expect(result.details).toMatchObject({ status: 'merged' });
  });

  it('returns decode failures for invalid update input', async () => {
    const result = await createUpdateTaskTool().execute('tool-call-8', {
      taskId: 'task-1',
      sliceId: 'slice-1',
      threadId: 'thread-1',
      status: 'queued',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('reads stored records from valid tool input', async () => {
    await createRememberMemoryEntryTool().execute('tool-call-sr0', {
      memoryId: 'memory-openclaw-read-1',
      kind: 'constraint',
      subject: ' Preserve audit history ',
      detail: 'Stored reads should expose persisted records.',
      tags: ['audit'],
      status: 'active',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    const result = await createReadStoredRecordTool().execute('tool-call-sr1', {
      scope: 'memory',
      key: 'memory-openclaw-read-1',
    });

    expect(result.details).toMatchObject({
      status: 'ok',
      scope: 'memory',
      key: 'memory-openclaw-read-1',
      record: {
        id: 'memory-openclaw-read-1',
        scope: 'memory',
      },
    });
  });

  it('returns decode failures for invalid stored record reads', async () => {
    const result = await createReadStoredRecordTool().execute('tool-call-sr2', {
      scope: 'memory',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns structured failures for missing stored record reads', async () => {
    const result = await createReadStoredRecordTool().execute('tool-call-sr3', {
      scope: 'memory',
      key: 'missing-memory-key',
    });

    expect(result.details).toMatchObject({
      status: 'failed',
      scope: 'memory',
      key: 'missing-memory-key',
    });
  });

  it('lists stored records from valid tool input', async () => {
    await createRememberMemoryEntryTool().execute('tool-call-ls0', {
      memoryId: 'memory-openclaw-list-1',
      kind: 'preference',
      subject: ' Prefer auditable controls ',
      detail: 'List calls should expose known persisted keys.',
      tags: ['controls'],
      status: 'active',
      updatedAt: '2026-04-04T00:00:00.000Z',
    });

    const result = await createListStoredRecordsTool().execute(
      'tool-call-ls1',
      {
        scope: 'memory',
      },
    );

    expect(result.details).toEqual(
      expect.objectContaining({
        status: 'ok',
        scope: 'memory',
        keys: expect.arrayContaining(['memory-openclaw-list-1']),
      }),
    );
  });

  it('returns decode failures for invalid stored record listing', async () => {
    const result = await createListStoredRecordsTool().execute(
      'tool-call-ls2',
      {},
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates task records from valid tool input', async () => {
    const result = await createTaskRecordTool().execute('tool-call-tq1', {
      id: 'queue-openclaw-1',
      summary: ' Queue a Discord implementation slice ',
      status: 'queued',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      taskId: 'task-queue-1',
      sliceId: 'slice-queue-1',
      threadId: 'thread-queue-1',
    });

    expect(result.details).toMatchObject({
      id: 'queue-openclaw-1',
      taskId: 'task-queue-1',
      status: 'queued',
      summary: 'Queue a Discord implementation slice',
      trace: expect.arrayContaining(['queue:task-queue-1:queued']),
    });
  });

  it('returns decode failures for invalid task record input', async () => {
    const result = await createTaskRecordTool().execute('tool-call-tq2', {
      id: 'queue-openclaw-2',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('stores records from valid tool input when policy allows it', async () => {
    const result = await createStoreRecordTool().execute('tool-call-ss1', {
      record: {
        id: 'storage-openclaw-write-1',
        key: 'storage-openclaw-write-1',
        scope: 'state',
        summary: ' Persisted state snapshot ',
        status: 'complete',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          state: 'review',
        },
      },
      actorId: 'operator-1',
      privileged: false,
    });

    expect(result.details).toMatchObject({
      allowed: true,
      policyDecisionId: 'policy-store-record',
      record: {
        id: 'storage-openclaw-write-1',
        key: 'storage-openclaw-write-1',
        scope: 'state',
        trace: expect.arrayContaining(['storage:state']),
      },
    });
  });

  it('blocks privileged record storage requests', async () => {
    const result = await createStoreRecordTool().execute('tool-call-ss2', {
      record: {
        id: 'storage-openclaw-write-2',
        key: 'storage-openclaw-write-2',
        scope: 'telemetry',
        summary: 'Blocked telemetry record',
        status: 'review',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          outcome: 'blocked',
        },
      },
      actorId: 'operator-1',
      privileged: true,
    });

    expect(result.details).toMatchObject({
      allowed: false,
      policyDecisionId: 'policy-store-record',
      scope: 'telemetry',
      key: 'storage-openclaw-write-2',
    });
  });

  it('returns decode failures for invalid record storage input', async () => {
    const result = await createStoreRecordTool().execute('tool-call-ss3', {
      record: {
        id: 'storage-openclaw-write-3',
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates pull request records from valid tool input', async () => {
    const result = await createPullRequestRecordTool().execute(
      'tool-call-pr0',
      {
        prNumber: 42,
        branchName: ' feature/discord-tools ',
        baseBranch: ' main ',
        title: ' Expand OpenClaw pull request wiring ',
        labels: ['automation', 'automation', ' review '],
        reviewState: 'review',
        mergeReady: false,
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      prNumber: 42,
      branchName: 'feature/discord-tools',
      baseBranch: 'main',
      title: 'Expand OpenClaw pull request wiring',
      labels: ['automation', 'review'],
      reviewState: 'review',
      mergeReady: false,
    });
  });

  it('returns decode failures for invalid pull request record input', async () => {
    const result = await createPullRequestRecordTool().execute(
      'tool-call-prx',
      {
        prNumber: 42,
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('submits pull request updates from valid tool input', async () => {
    const result = await createSubmitPullRequestUpdateTool().execute(
      'tool-call-pr1',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      allowed: false,
      request: { action: 'update-pr' },
    });
  });

  it('submits pull request merges from valid tool input', async () => {
    const result = await createSubmitPullRequestMergeTool().execute(
      'tool-call-pr1a',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        actorId: 'operator-1',
      },
    );

    expect(result.details).toMatchObject({
      allowed: false,
      request: { action: 'merge-pr' },
    });
  });

  it('returns decode failures for invalid pull request merge input', async () => {
    const result = await createSubmitPullRequestMergeTool().execute(
      'tool-call-pr1b',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid pull request update input', async () => {
    const result = await createSubmitPullRequestUpdateTool().execute(
      'tool-call-pr2',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('plans dependent rebases from valid tool input', async () => {
    const result = await createPlanRebaseDependentsTool().execute(
      'tool-call-rb1',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/downstream'],
      },
    );

    expect(result.details).toMatchObject({
      mergedPrNumber: 42,
      rebaseRequired: true,
    });
  });

  it('executes dependent rebases through worktree sync results', async () => {
    const result = await createExecuteRebaseDependentsTool().execute(
      'tool-call-rb1a',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/downstream'],
        syncMode: 'rebase',
      },
    );

    expect(result.details).toMatchObject({
      plan: {
        mergedPrNumber: 42,
      },
      syncMode: 'rebase',
      executed: true,
      syncResults: [
        {
          baseBranch: 'main',
          branchName: 'feature/downstream',
        },
      ],
    });
  });

  it('defaults dependent rebase execution to rebase sync mode', async () => {
    const result = await createExecuteRebaseDependentsTool().execute(
      'tool-call-rb1b',
      {
        record: {
          prNumber: 42,
          branchName: 'feature/discord-tools',
          baseBranch: 'main',
          title: 'Expand OpenClaw tools',
          labels: ['automation'],
          reviewState: 'approved',
          mergeReady: true,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        dependentBranches: ['feature/downstream'],
      },
    );

    expect(result.details).toMatchObject({
      syncMode: 'rebase',
      executed: true,
    });
  });

  it('returns decode failures for invalid dependent rebase execution input', async () => {
    const result = await createExecuteRebaseDependentsTool().execute(
      'tool-call-rb1c',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('returns decode failures for invalid rebase plan input', async () => {
    const result = await createPlanRebaseDependentsTool().execute(
      'tool-call-rb2',
      {
        record: {
          prNumber: 42,
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('creates GitHub action requests from valid tool input', async () => {
    const result = await createGitHubActionRequestTool().execute(
      'tool-call-gh0',
      {
        repoFullName: ' VannaDii/devplat ',
        action: 'sync-branch',
        summary: ' Sync downstream branch ',
        privileged: false,
        branchName: ' feature/downstream ',
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
    );

    expect(result.details).toMatchObject({
      repoFullName: 'VannaDii/devplat',
      action: 'sync-branch',
      summary: 'Sync downstream branch',
      branchName: 'feature/downstream',
    });
  });

  it('returns decode failures for invalid GitHub action request input', async () => {
    const result = await createGitHubActionRequestTool().execute(
      'tool-call-gh0b',
      {
        repoFullName: 'VannaDii/devplat',
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('submits GitHub actions from valid tool input', async () => {
    const cases = [
      {
        inputs: {
          params: {
            request: {
              repoFullName: 'VannaDii/devplat',
              action: 'sync-branch',
              summary: 'Sync downstream branch',
              privileged: false,
              branchName: 'feature/downstream',
              updatedAt: '2026-04-04T00:00:00.000Z',
            },
            actorId: 'operator-1',
          },
        },
        mock: () =>
          createSubmitGitHubActionTool({
            async submit(request) {
              return {
                request,
                allowed: true,
                policyDecisionId: 'policy-sync-branch',
                submitted: true,
                receipt: {
                  method: 'PUT',
                  endpoint: '/repos/VannaDii/devplat/pulls/42/update-branch',
                  statusCode: 202,
                  responseBody: { ok: true },
                },
              };
            },
          }),
        assert: (
          result: Awaited<
            ReturnType<
              ReturnType<typeof createSubmitGitHubActionTool>['execute']
            >
          >,
        ) => {
          expect(result.details).toMatchObject({
            allowed: true,
            submitted: true,
            request: { action: 'sync-branch' },
          });
        },
      },
    ];

    for (const testCase of cases) {
      const tool = testCase.mock();
      const result = await tool.execute(
        'tool-call-gh1',
        testCase.inputs.params,
      );
      testCase.assert(result);
    }
  });

  it('returns decode failures for invalid GitHub action input', async () => {
    const result = await createSubmitGitHubActionTool().execute(
      'tool-call-gh2',
      {
        request: {
          repoFullName: 'VannaDii/devplat',
        },
      },
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('rejects missing artifact payloads', async () => {
    const result = await createValidateArtifactTool().execute(
      'tool-call-9',
      {},
    );

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('rejects invalid artifact envelopes', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-10', {
      artifact: {},
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('validates well-formed artifact envelopes', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-11', {
      artifact: {
        id: 'artifact-1',
        artifactType: 'review-finding',
        version: 1,
        summary: 'artifact',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          findingId: 'finding-1',
        },
      },
    });

    expect(result.details).toMatchObject({ artifactType: 'review-finding' });
  });

  it('validates and normalizes known artifact contracts', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-11b', {
      artifact: {
        id: 'artifact-approval-1',
        artifactType: 'approval-record',
        version: 1,
        summary: ' Approve slice ',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          approvalId: ' approval-1 ',
          subjectType: 'slice',
          subjectId: ' slice-1 ',
          actorId: ' operator-1 ',
          decision: 'approved',
          rationale: ' Ready to proceed ',
        },
      },
    });

    expect(result.details).toMatchObject({
      artifactType: 'approval-record',
      summary: 'Approve slice',
      payload: {
        approvalId: 'approval-1',
        subjectId: 'slice-1',
        actorId: 'operator-1',
        rationale: 'Ready to proceed',
      },
    });
  });

  it('rejects malformed known artifact contracts', async () => {
    const result = await createValidateArtifactTool().execute('tool-call-11c', {
      artifact: {
        id: 'artifact-approval-2',
        artifactType: 'approval-record',
        version: 1,
        summary: 'Approve slice',
        status: 'approved',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
        payload: {
          approvalId: 'approval-2',
        },
      },
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });

  it('runs supervisor steps from valid tool input', async () => {
    const result = await createRunSupervisorStepTool().execute('tool-call-12', {
      action: 'retry-gates',
      actorId: 'operator-1',
      privileged: false,
      lifecycleSignals: [
        {
          phase: 'gates',
          ready: true,
          artifactIds: ['gate-run-1'],
          blockers: [],
          nextAction: 'review-findings',
        },
      ],
    });

    expect(result.details).toMatchObject({
      approved: true,
      nextState: 'approved',
      routePlan: {
        nextPhase: 'review',
        routedTo: 'review-findings-service',
      },
    });
  });

  it('returns decode failures for invalid supervisor input', async () => {
    const result = await createRunSupervisorStepTool().execute('tool-call-13', {
      action: 'retry-gates',
      actorId: 'operator-1',
    });

    expect(result.details).toMatchObject({ status: 'failed' });
  });
});

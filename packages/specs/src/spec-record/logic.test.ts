import { describe, expect, it } from 'vitest';

import {
  approveSpecRecord,
  createSpecRecord,
  describeSpecRecord,
  renderSpecPullRequestBody,
  updateSpecRecord,
} from './logic.js';
import type { SpecRecord } from './types.js';

describe('SpecRecord logic', () => {
  it('normalizes acceptance criteria and approval state transitions', () => {
    const snapshot = createSpecRecord({
      specId: 'spec-001',
      researchId: 'research-001',
      title: '  Discord-first approvals  ',
      objective: '  Define how explicit approvals are recorded.  ',
      acceptanceCriteria: [
        'Audit log entry',
        'Audit log entry',
        'Thread scoped',
      ],
      approvalState: 'draft',
      version: 1,
      updatedAt: '2026-04-04T00:00:00.000Z',
    });
    const approved = approveSpecRecord(snapshot);

    expect(snapshot.title).toBe('Discord-first approvals');
    expect(snapshot.acceptanceCriteria).toEqual([
      'Audit log entry',
      'Thread scoped',
    ]);
    expect(approved.approvalState).toBe('approved');
    expect(describeSpecRecord(snapshot)).toContain('Spec record');
  });

  it('tracks revision history and renders PR-ready bodies', () => {
    const cases = [
      {
        inputs: {
          record: {
            specId: 'spec-002',
            researchId: 'research-002',
            title: '  Autonomous delivery path  ',
            objective: '  Make the lifecycle auditable.  ',
            acceptanceCriteria: ['Persist revisions', 'Persist revisions'],
            approvalState: 'approved',
            version: 2,
            updatedAt: '2026-04-05T00:00:00.000Z',
            revisionHistory: [
              {
                version: 1,
                summary: '  Initial draft  ',
                updatedAt: '2026-04-04T00:00:00.000Z',
              },
            ],
            sourceArtifactIds: ['artifact-1', 'artifact-1'],
          } satisfies SpecRecord,
        },
        mock: () => undefined,
        assert: (record: ReturnType<typeof updateSpecRecord>) => {
          expect(record.approvalState).toBe('review');
          expect(record.version).toBe(3);
          expect(record.revisionHistory).toHaveLength(2);
          expect(record.sourceArtifactIds).toEqual(['artifact-1']);
          expect(record.renderedPullRequestBody).toContain(
            '### Acceptance Criteria',
          );
        },
      },
    ];

    for (const testCase of cases) {
      testCase.mock();
      const record = updateSpecRecord(testCase.inputs.record);
      testCase.assert(record);
      expect(renderSpecPullRequestBody(record)).toContain(
        'Autonomous delivery path',
      );
    }
  });
});

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
  const cases = [
    {
      name: 'normalizes acceptance criteria and approval state transitions',
      inputs: {
        record: {
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
        },
      },
      mock: () => undefined,
      assert: (inputs: { record: SpecRecord }) => {
        const snapshot = createSpecRecord(inputs.record);
        const approved = approveSpecRecord(snapshot);
        const rendered = renderSpecPullRequestBody(snapshot);

        expect(snapshot.title).toBe('Discord-first approvals');
        expect(snapshot.acceptanceCriteria).toEqual([
          'Audit log entry',
          'Thread scoped',
        ]);
        expect(approved.approvalState).toBe('approved');
        expect(describeSpecRecord(snapshot)).toContain('Spec record');
        expect(rendered).not.toContain('### Source Artifacts');
        expect(rendered).not.toContain('### Revision History');
      },
    },
    {
      name: 'tracks revision metadata and renders PR-ready bodies',
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
              artifactId: ' artifact-0 ',
            },
          ],
          sourceArtifactIds: ['artifact-1', 'artifact-1'],
        },
      },
      mock: () => undefined,
      assert: (inputs: { record: SpecRecord }) => {
        const record = updateSpecRecord(inputs.record);
        const rendered = renderSpecPullRequestBody(record);

        expect(record.approvalState).toBe('review');
        expect(record.version).toBe(3);
        expect(record.revisionHistory).toHaveLength(2);
        expect(record.revisionHistory?.[0]?.artifactId).toBe('artifact-0');
        expect(record.revisionHistory?.at(-1)).toMatchObject({
          revisionId: 'spec-002:v3',
          previousVersion: 2,
          approvalStateBeforeUpdate: 'approved',
        });
        expect(record.sourceArtifactIds).toEqual(['artifact-1']);
        expect(record.renderedPullRequestBody).toContain('### Metadata');
        expect(rendered).toContain('- Spec ID: spec-002');
        expect(rendered).toContain('### Source Artifacts');
        expect(rendered).toContain('- artifact-1');
        expect(rendered).toContain('### Revision History');
        expect(rendered).toContain('- v1: Initial draft');
      },
    },
  ];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    testCase.mock();
    testCase.assert(testCase.inputs);
  });
});

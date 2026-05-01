import { describe, expect, it } from 'vitest';

import { SpecRecordService } from './service.js';
import type { SpecRecord } from './codec.js';

type SpecRecordServiceInputs = {
  record: SpecRecord;
};

type SpecRecordServiceCase = {
  name: string;
  inputs: SpecRecordServiceInputs;
  mock: () => {
    service: SpecRecordService;
  };
  assert: (
    context: { service: SpecRecordService },
    inputs: SpecRecordServiceInputs,
  ) => void;
};

describe('SpecRecordService', () => {
  const cases = [
    {
      name: 'creates spec artifacts and approvals',
      inputs: {
        record: {
          specId: 'spec-001',
          researchId: 'research-001',
          title: 'Discord approvals',
          objective: 'Require explicit human confirmations.',
          acceptanceCriteria: ['Thread-aware command scope'],
          approvalState: 'review',
          version: 2,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SpecRecordService(),
      }),
      assert: (context, inputs) => {
        const snapshot = context.service.execute(inputs.record);
        const approved = context.service.approve(snapshot);
        const artifact = context.service.toArtifact(approved);

        expect(approved.approvalState).toBe('approved');
        expect(artifact.status).toBe('approved');
        expect(artifact.payload).toMatchObject({ specId: 'spec-001' });
        expect(context.service.explain(snapshot)).toContain('Spec record');
      },
    },
    {
      name: 'emits draft artifacts before approval',
      inputs: {
        record: {
          specId: 'spec-002',
          researchId: 'research-002',
          title: ' Draft spec ',
          objective: ' Keep the draft path visible. ',
          acceptanceCriteria: [' one ', 'one'],
          approvalState: 'draft',
          version: 0,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SpecRecordService(),
      }),
      assert: (context, inputs) => {
        const draft = context.service.draft(inputs.record);
        const artifact = context.service.toArtifact(draft);

        expect(artifact.status).toBe('draft');
        expect(draft.version).toBe(1);
      },
    },
    {
      name: 'increments spec versions for updated revisions and returns them to review',
      inputs: {
        record: {
          specId: 'spec-003',
          researchId: 'research-003',
          title: 'Approved spec',
          objective: 'Preserve revision history.',
          acceptanceCriteria: ['record updates'],
          approvalState: 'approved',
          version: 3,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SpecRecordService(),
      }),
      assert: (context, inputs) => {
        const updated = context.service.update(inputs.record);

        expect(updated.version).toBe(4);
        expect(updated.approvalState).toBe('review');
      },
    },
    {
      name: 'preserves non-approved review state when creating an updated revision',
      inputs: {
        record: {
          specId: 'spec-004',
          researchId: 'research-004',
          title: 'Review spec',
          objective: 'Keep in-review revisions in review.',
          acceptanceCriteria: ['retain review state'],
          approvalState: 'review',
          version: 1,
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => ({
        service: new SpecRecordService(),
      }),
      assert: (context, inputs) => {
        const updated = context.service.update(inputs.record);

        expect(updated.version).toBe(2);
        expect(updated.approvalState).toBe('review');
      },
    },
  ] satisfies SpecRecordServiceCase[];

  it.each(cases)('$name', (testCase) => {
    expect.hasAssertions();
    const context = testCase.mock();

    testCase.assert(context, testCase.inputs);
  });
});

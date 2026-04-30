import { describe, expect, it } from 'vitest';

import { DomainSnapshotCodec } from './codec.js';
import { DomainService, decodeWithCodec } from './service.js';

describe('DomainService', () => {
  const cases = [
    {
      name: 'delegates to the unit logic',
      inputs: {
        snapshot: {
          id: 'core-001',
          summary: 'Shared domain primitives for DevPlat.',
          status: 'draft',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          domain: 'core',
        },
      },
      mock: () => new DomainService(),
      assert: (
        service: DomainService,
        inputs: { snapshot: Parameters<DomainService['execute']>[0] },
      ) => {
        const snapshot = service.execute(inputs.snapshot);

        expect(snapshot.trace).toContain('domain:core');
        expect(service.explain(snapshot)).toContain('core');
      },
    },
    {
      name: 'decodes valid codec payloads and surfaces invalid ones',
      inputs: {
        valid: {
          id: 'core-001',
          summary: 'ok',
          status: 'draft',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          domain: 'core',
        },
        invalid: { id: 'broken' },
      },
      mock: () => undefined,
      assert: (
        context: undefined,
        inputs: {
          valid: Parameters<typeof decodeWithCodec>[1];
          invalid: Parameters<typeof decodeWithCodec>[1];
        },
      ) => {
        const valid = decodeWithCodec(DomainSnapshotCodec, inputs.valid);
        const invalid = decodeWithCodec(DomainSnapshotCodec, inputs.invalid);

        expect(valid.ok).toBe(true);
        expect(invalid.ok).toBe(false);
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      const context = testCase.mock();
      testCase.assert(context, testCase.inputs);
    });
  }
});

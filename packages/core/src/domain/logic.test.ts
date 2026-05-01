import { describe, expect, it } from 'vitest';

import {
  appendTrace,
  createDevplatFailure,
  createDevplatError,
  createDevplatId,
  createDevplatSuccess,
  createDomainSnapshot,
  createIsoTimestamp,
  createRepositoryKey,
  describeDomainSnapshot,
} from './logic.js';

describe('DomainSnapshot logic', () => {
  const cases = [
    {
      name: 'normalizes the summary and appends a domain trace marker',
      inputs: {
        snapshot: {
          id: 'core-001',
          summary: '  Shared domain primitives for DevPlat.  ',
          status: 'draft',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
          domain: 'core',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        snapshot: Parameters<typeof createDomainSnapshot>[0];
      }) => {
        const snapshot = createDomainSnapshot(inputs.snapshot);

        expect(snapshot.summary).toBe('Shared domain primitives for DevPlat.');
        expect(snapshot.trace).toContain('domain:core');
        expect(describeDomainSnapshot(snapshot)).toContain('core');
      },
    },
    {
      name: 'can append trace markers to arbitrary trace records',
      inputs: {
        record: {
          id: 'record-1',
          summary: ' demo ',
          status: 'queued',
          trace: [],
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
        trace: 'custom:trace',
      },
      mock: () => undefined,
      assert: (inputs: {
        record: Parameters<typeof appendTrace>[0];
        trace: string;
      }) => {
        const record = appendTrace(inputs.record, inputs.trace);

        expect(record.trace).toEqual(['custom:trace']);
        expect(record.summary).toBe('demo');
      },
    },
    {
      name: 'creates structured platform errors with safe defaults',
      inputs: {
        error: {
          kind: 'policy-denied',
          message: '  merge requires approval  ',
        },
      },
      mock: () => undefined,
      assert: (inputs: { error: Parameters<typeof createDevplatError>[0] }) => {
        const error = createDevplatError(inputs.error);

        expect(error).toEqual({
          kind: 'policy-denied',
          message: 'merge requires approval',
          retryable: false,
          details: {},
          code: 'policy-denied',
          severity: 'error',
          source: 'devplat',
        });
      },
    },
    {
      name: 'preserves explicit platform error metadata',
      inputs: {
        error: {
          kind: 'execution',
          message: ' retry later ',
          retryable: true,
          details: {
            command: 'test',
          },
          code: 'gate.command_failed',
          severity: 'warning',
          source: 'gates',
        },
      },
      mock: () => undefined,
      assert: (inputs: { error: Parameters<typeof createDevplatError>[0] }) => {
        expect(createDevplatError(inputs.error)).toEqual({
          kind: 'execution',
          message: 'retry later',
          retryable: true,
          details: {
            command: 'test',
          },
          code: 'gate.command_failed',
          severity: 'warning',
          source: 'gates',
        });
      },
    },
    {
      name: 'normalizes value objects and result envelopes',
      inputs: {
        valid: {
          id: ' devplat-1 ',
          repositoryKey: ' VannaDii/devplat ',
          timestamp: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        valid: {
          id: string;
          repositoryKey: string;
          timestamp: string;
        };
      }) => {
        expect(createDevplatId(inputs.valid.id)).toBe('devplat-1');
        expect(createRepositoryKey(inputs.valid.repositoryKey)).toBe(
          'VannaDii/devplat',
        );
        expect(createIsoTimestamp(inputs.valid.timestamp)).toBe(
          '2026-04-04T00:00:00.000Z',
        );
        expect(createDevplatSuccess('ok')).toEqual({
          ok: true,
          value: 'ok',
        });
        expect(
          createDevplatFailure({
            error: ' blocked ',
            diagnostic: createDevplatError({
              kind: 'policy-denied',
              message: 'blocked',
            }),
          }),
        ).toMatchObject({
          ok: false,
          error: 'blocked',
        });
        expect(createDevplatFailure({ error: ' no diagnostic ' })).toEqual({
          ok: false,
          error: 'no diagnostic',
        });
      },
    },
    {
      name: 'rejects invalid repository keys',
      inputs: {
        repositoryKey: 'invalid',
      },
      mock: () => undefined,
      assert: (inputs: { repositoryKey: string }) => {
        expect(() => createRepositoryKey(inputs.repositoryKey)).toThrow(
          'owner/repo',
        );
      },
    },
    {
      name: 'rejects empty platform ids',
      inputs: {
        id: '   ',
      },
      mock: () => undefined,
      assert: (inputs: { id: string }) => {
        expect(() => createDevplatId(inputs.id)).toThrow('must not be empty');
      },
    },
    {
      name: 'rejects invalid timestamps with a domain error',
      inputs: {
        timestamp: 'not-a-date',
      },
      mock: () => undefined,
      assert: (inputs: { timestamp: string }) => {
        expect(() => createIsoTimestamp(inputs.timestamp)).toThrow(
          'ISO timestamp must be a valid date.',
        );
      },
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect.hasAssertions();
      testCase.mock();
      testCase.assert(testCase.inputs);
    });
  }
});

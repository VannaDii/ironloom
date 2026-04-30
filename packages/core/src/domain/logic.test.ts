import { describe, expect, it } from 'vitest';

import {
  appendTrace,
  createDevplatError,
  createDomainSnapshot,
  describeDomainSnapshot,
} from './logic.js';

describe('DomainSnapshot logic', () => {
  it('normalizes the summary and appends a domain trace marker', () => {
    const snapshot = createDomainSnapshot({
      id: 'core-001',
      summary: '  Shared domain primitives for DevPlat.  ',
      status: 'draft',
      trace: [],
      updatedAt: '2026-04-04T00:00:00.000Z',
      domain: 'core',
    });

    expect(snapshot.summary).toBe('Shared domain primitives for DevPlat.');
    expect(snapshot.trace).toContain('domain:core');
    expect(describeDomainSnapshot(snapshot)).toContain('core');
  });

  it('can append trace markers to arbitrary trace records', () => {
    const record = appendTrace(
      {
        id: 'record-1',
        summary: ' demo ',
        status: 'queued',
        trace: [],
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
      'custom:trace',
    );

    expect(record.trace).toEqual(['custom:trace']);
    expect(record.summary).toBe('demo');
  });

  it('creates structured platform errors with safe defaults', () => {
    const error = createDevplatError({
      kind: 'policy-denied',
      message: '  merge requires approval  ',
    });

    expect(error).toEqual({
      kind: 'policy-denied',
      message: 'merge requires approval',
      retryable: false,
      details: {},
    });
  });
});

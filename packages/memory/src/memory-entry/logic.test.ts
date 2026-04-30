import { describe, expect, it } from 'vitest';

import {
  bundleMemoryContext,
  createMemoryContextBundle,
  createMemoryEntry,
  describeMemoryEntry,
} from './logic.js';

describe('MemoryEntry logic', () => {
  const cases = [
    {
      name: 'normalizes tags and optional artifact ids',
      inputs: {
        entry: {
          memoryId: 'memory-001',
          kind: 'decision',
          subject: '  Prefer Discord-first control flow  ',
          detail: '  Approval actions must stay thread-scoped.  ',
          tags: ['discord', 'policy', 'discord', ''],
          status: 'active',
          sourceArtifactId: ' artifact-001 ',
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: { entry: Parameters<typeof createMemoryEntry>[0] }) => {
        const entry = createMemoryEntry(inputs.entry);

        expect(entry.subject).toBe('Prefer Discord-first control flow');
        expect(entry.detail).toBe('Approval actions must stay thread-scoped.');
        expect(entry.tags).toEqual(['discord', 'policy']);
        expect(entry.sourceArtifactId).toBe('artifact-001');
        expect(describeMemoryEntry(entry)).toContain('decision memory');
      },
    },
    {
      name: 'builds reusable decision and trap bundles from memory entries',
      inputs: {
        bundleId: ' bundle-1 ',
        entries: [
          {
            memoryId: 'memory-decision-1',
            kind: 'decision',
            subject: '  Use GitHub as source of truth  ',
            detail: 'Specs and PRs live in GitHub.',
            tags: ['github'],
            status: 'active',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
          {
            memoryId: 'memory-trap-1',
            kind: 'trap',
            subject: '  Avoid thread ambiguity  ',
            detail: 'Discord actions fail closed.',
            tags: ['discord'],
            status: 'active',
            updatedAt: '2026-04-04T00:00:00.000Z',
          },
        ],
        updatedAt: '2026-04-04T00:00:00.000Z',
      },
      mock: () => undefined,
      assert: (inputs: {
        bundleId: string;
        entries: Parameters<typeof bundleMemoryContext>[1];
        updatedAt: string;
      }) => {
        const bundle = bundleMemoryContext(
          inputs.bundleId,
          inputs.entries,
          inputs.updatedAt,
        );

        expect(bundle.decisions.decisionIds).toEqual(['memory-decision-1']);
        expect(bundle.knownTraps.trapIds).toEqual(['memory-trap-1']);
        expect(bundle.reusableContext).toEqual([
          'decision:Use GitHub as source of truth',
          'trap:Avoid thread ambiguity',
        ]);
      },
    },
    {
      name: 'normalizes reusable context bundles',
      inputs: {
        bundle: {
          bundleId: ' bundle-2 ',
          decisions: {
            decisionIds: ['decision-1', 'decision-1', ''],
            rationale: '  Use stable policy.  ',
          },
          knownTraps: {
            trapIds: ['trap-1', 'trap-1'],
            mitigation: '  Check before execution.  ',
          },
          reusableContext: ['  policy context  ', 'policy context'],
          sourceMemoryIds: ['memory-1', 'memory-1'],
          updatedAt: '2026-04-04T00:00:00.000Z',
        },
      },
      mock: () => undefined,
      assert: (inputs: {
        bundle: Parameters<typeof createMemoryContextBundle>[0];
      }) => {
        const bundle = createMemoryContextBundle(inputs.bundle);

        expect(bundle.bundleId).toBe('bundle-2');
        expect(bundle.decisions.decisionIds).toEqual(['decision-1']);
        expect(bundle.knownTraps.trapIds).toEqual(['trap-1']);
        expect(bundle.reusableContext).toEqual(['policy context']);
        expect(bundle.sourceMemoryIds).toEqual(['memory-1']);
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

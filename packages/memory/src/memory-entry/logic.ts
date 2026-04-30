import type { MemoryContextBundle, MemoryEntry } from './types.js';

function uniqueTrimmed(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

export function createMemoryEntry(input: MemoryEntry): MemoryEntry {
  const sourceArtifactId = input.sourceArtifactId?.trim();

  return {
    ...input,
    subject: input.subject.trim(),
    detail: input.detail.trim(),
    tags: uniqueTrimmed(input.tags),
    updatedAt: new Date(input.updatedAt).toISOString(),
    ...(sourceArtifactId ? { sourceArtifactId } : {}),
  };
}

export function createMemoryContextBundle(
  input: MemoryContextBundle,
): MemoryContextBundle {
  return {
    bundleId: input.bundleId.trim(),
    decisions: {
      decisionIds: uniqueTrimmed(input.decisions.decisionIds),
      rationale: input.decisions.rationale.trim(),
    },
    knownTraps: {
      trapIds: uniqueTrimmed(input.knownTraps.trapIds),
      mitigation: input.knownTraps.mitigation.trim(),
    },
    reusableContext: uniqueTrimmed(input.reusableContext),
    sourceMemoryIds: uniqueTrimmed(input.sourceMemoryIds),
    updatedAt: new Date(input.updatedAt).toISOString(),
  };
}

export function bundleMemoryContext(
  bundleId: string,
  entries: readonly MemoryEntry[],
  updatedAt: string,
): MemoryContextBundle {
  const normalizedEntries = entries.map(createMemoryEntry);
  return createMemoryContextBundle({
    bundleId,
    decisions: {
      decisionIds: normalizedEntries
        .filter((entry) => entry.kind === 'decision')
        .map((entry) => entry.memoryId),
      rationale: 'Reusable decisions selected from active memory.',
    },
    knownTraps: {
      trapIds: normalizedEntries
        .filter((entry) => entry.kind === 'trap')
        .map((entry) => entry.memoryId),
      mitigation: 'Review known traps before execution.',
    },
    reusableContext: normalizedEntries.map(
      (entry) => `${entry.kind}:${entry.subject}`,
    ),
    sourceMemoryIds: normalizedEntries.map((entry) => entry.memoryId),
    updatedAt,
  });
}

export function describeMemoryEntry(input: MemoryEntry): string {
  return `${input.kind} memory -> ${input.subject}`;
}

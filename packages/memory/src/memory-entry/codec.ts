import * as t from 'io-ts';

export const MemoryEntryCodec = t.intersection([
  t.type({
    memoryId: t.string,
    kind: t.union([
      t.literal('decision'),
      t.literal('constraint'),
      t.literal('preference'),
      t.literal('trap'),
    ]),
    subject: t.string,
    detail: t.string,
    tags: t.array(t.string),
    status: t.union([t.literal('active'), t.literal('superseded')]),
    updatedAt: t.string,
  }),
  t.partial({
    sourceArtifactId: t.string,
  }),
]);

export const MemoryContextBundleCodec = t.type({
  bundleId: t.string,
  decisions: t.type({
    decisionIds: t.array(t.string),
    rationale: t.string,
  }),
  knownTraps: t.type({
    trapIds: t.array(t.string),
    mitigation: t.string,
  }),
  reusableContext: t.array(t.string),
  sourceMemoryIds: t.array(t.string),
  updatedAt: t.string,
});

/** Durable memory entry captured for future planning context. */
export type MemoryEntry = t.TypeOf<typeof MemoryEntryCodec>;

/** Memory entry kind. */
export type MemoryKind = MemoryEntry['kind'];

/** Memory lifecycle status. */
export type MemoryStatus = MemoryEntry['status'];

/** Bundle of remembered decisions and known traps. */
export type MemoryContextBundle = t.TypeOf<typeof MemoryContextBundleCodec>;

/** Decision log extracted from a memory context bundle. */
export type MemoryDecisionLog = MemoryContextBundle['decisions'];

/** Known-trap bundle extracted from a memory context bundle. */
export type KnownTrapBundle = MemoryContextBundle['knownTraps'];

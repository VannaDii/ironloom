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

import type * as t from 'io-ts';

import type { MemoryContextBundleCodec, MemoryEntryCodec } from './codec.js';

export type MemoryEntry = t.TypeOf<typeof MemoryEntryCodec>;

export type MemoryKind = MemoryEntry['kind'];

export type MemoryStatus = MemoryEntry['status'];

export type MemoryContextBundle = t.TypeOf<typeof MemoryContextBundleCodec>;

export type MemoryDecisionLog = MemoryContextBundle['decisions'];

export type KnownTrapBundle = MemoryContextBundle['knownTraps'];

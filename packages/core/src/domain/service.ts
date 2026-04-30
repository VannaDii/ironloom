import { PathReporter } from 'io-ts/lib/PathReporter.js';
import { isLeft } from 'fp-ts/lib/Either.js';
import type * as t from 'io-ts';

import { createDomainSnapshot, describeDomainSnapshot } from './logic.js';
import type { DevplatResult, DomainSnapshot } from './types.js';

export class DomainService {
  public execute(input: DomainSnapshot): DomainSnapshot {
    return createDomainSnapshot(input);
  }

  public explain(input: DomainSnapshot): string {
    return describeDomainSnapshot(input);
  }
}

export function decodeWithCodec<TValue>(
  codec: t.Type<TValue, TValue>,
  value: unknown,
): DevplatResult<TValue> {
  const decoded = codec.decode(value);
  if (isLeft(decoded)) {
    return {
      ok: false,
      error: PathReporter.report(decoded).join('; '),
    };
  }

  return {
    ok: true,
    value: decoded.right,
  };
}

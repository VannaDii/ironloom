import { PathReporter } from 'io-ts/lib/PathReporter.js';
import { isLeft } from 'fp-ts/lib/Either.js';
import type * as t from 'io-ts';

import { createDomainSnapshot, describeDomainSnapshot } from './logic.js';
import type { DevplatResult, DomainSnapshot } from './codec.js';

/**
 * Service shell for domain snapshot normalization.
 */
export class DomainService {
  /**
   * Executes domain snapshot normalization.
   */
  public execute(input: DomainSnapshot): DomainSnapshot {
    return createDomainSnapshot(input);
  }

  /**
   * Describes a domain snapshot for operator-facing output.
   */
  public explain(input: DomainSnapshot): string {
    return describeDomainSnapshot(input);
  }
}

/**
 * Decodes a value with an `io-ts` codec and returns a platform result.
 */
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

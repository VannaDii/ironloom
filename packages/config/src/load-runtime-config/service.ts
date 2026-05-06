import { createDefaultDevplatConfig, describeDevplatConfig } from './logic.js';
import type { DevplatConfig } from './codec.js';

/** Runtime config service. */
export class RuntimeConfigService {
  /** From environment. */
  public fromEnvironment(
    env: Record<string, string | undefined>,
  ): DevplatConfig {
    return createDefaultDevplatConfig(env);
  }

  /** Executes the service operation. */
  public execute(input: DevplatConfig): DevplatConfig {
    return input;
  }

  /** Describes the service result for operators. */
  public explain(input: DevplatConfig): string {
    return describeDevplatConfig(input);
  }
}

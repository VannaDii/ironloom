import { createDefaultDevplatConfig, describeDevplatConfig } from './logic.js';
import type { DevplatConfig } from './codec.js';

export class RuntimeConfigService {
  public fromEnvironment(
    env: Record<string, string | undefined>,
  ): DevplatConfig {
    return createDefaultDevplatConfig(env);
  }

  public execute(input: DevplatConfig): DevplatConfig {
    return input;
  }

  public explain(input: DevplatConfig): string {
    return describeDevplatConfig(input);
  }
}

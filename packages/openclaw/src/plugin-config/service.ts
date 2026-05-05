import type { DevplatConfig } from '@vannadii/devplat-config';

import {
  createOpenClawPluginConfig,
  createOpenClawPluginConfigFromRuntimeConfig,
  describeOpenClawPluginConfig,
} from './logic.js';
import type { OpenClawPluginConfig } from './codec.js';

/** Plugin config service service. */
export class PluginConfigService {
  /** Executes the service operation. */
  public execute(input: OpenClawPluginConfig): OpenClawPluginConfig {
    return createOpenClawPluginConfig(input);
  }

  /** From runtime config. */
  public fromRuntimeConfig(input: DevplatConfig): OpenClawPluginConfig {
    return createOpenClawPluginConfigFromRuntimeConfig(input);
  }

  /** Describes the service result for operators. */
  public explain(input: OpenClawPluginConfig): string {
    return describeOpenClawPluginConfig(input);
  }
}

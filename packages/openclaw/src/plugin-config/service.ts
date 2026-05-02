import type { DevplatConfig } from '@vannadii/devplat-config';

import {
  createOpenClawPluginConfig,
  createOpenClawPluginConfigFromRuntimeConfig,
  describeOpenClawPluginConfig,
} from './logic.js';
import type { OpenClawPluginConfig } from './codec.js';

export class PluginConfigService {
  public execute(input: OpenClawPluginConfig): OpenClawPluginConfig {
    return createOpenClawPluginConfig(input);
  }

  public fromRuntimeConfig(input: DevplatConfig): OpenClawPluginConfig {
    return createOpenClawPluginConfigFromRuntimeConfig(input);
  }

  public explain(input: OpenClawPluginConfig): string {
    return describeOpenClawPluginConfig(input);
  }
}

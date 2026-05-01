import {
  CommandExecutionService,
  type CommandResult,
} from '@vannadii/devplat-execution';

import {
  createGateRunReport,
  describeGateRunReport,
  type GateExecutor,
  runGates,
} from './logic.js';
import type { GateRunReport } from './codec.js';

export class RunGatesService {
  public constructor(
    private readonly executeCommand: GateExecutor = (
      command,
      args,
    ): Promise<CommandResult> =>
      new CommandExecutionService().execute(command, args),
  ) {}

  public execute(input: GateRunReport): GateRunReport {
    return createGateRunReport(input);
  }

  public explain(input: GateRunReport): string {
    return describeGateRunReport(input);
  }

  public async run(
    gateNames: string[],
    summary: string,
  ): Promise<GateRunReport> {
    return runGates(gateNames, summary, this.executeCommand);
  }
}

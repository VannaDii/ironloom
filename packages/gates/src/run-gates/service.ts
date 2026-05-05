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

/** Run gates service. */
export class RunGatesService {
  public constructor(
    private readonly executeCommand: GateExecutor = (
      command,
      args,
    ): Promise<CommandResult> =>
      new CommandExecutionService().execute(command, args),
  ) {}

  /** Executes the service operation. */
  public execute(input: GateRunReport): GateRunReport {
    return createGateRunReport(input);
  }

  /** Describes the service result for operators. */
  public explain(input: GateRunReport): string {
    return describeGateRunReport(input);
  }

  /** Runs the service workflow. */
  public async run(
    gateNames: string[],
    summary: string,
  ): Promise<GateRunReport> {
    return runGates(gateNames, summary, this.executeCommand);
  }
}

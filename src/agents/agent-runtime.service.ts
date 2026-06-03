import { Injectable } from '@nestjs/common';

/**
 * Single source of truth for the agent runtime switches. Both the autonomous
 * engine and the (event-driven) automatic agent triggers consult this, so when
 * the operator turns agents off in Settings, *nothing* runs and zero LLM calls
 * are made — no matter which path would have fired the agent.
 *
 * Lives in AgentsModule (the lowest-level agent module) so the orchestrator and
 * the metric-refresh listener can read it without importing AutonomousModule
 * (which would create a circular dependency).
 *
 * `autonomous` drives the reactive data loop (metric pulls, draft advancement,
 * campaign sweeps, the hourly monitor cron, and the metric-refresh performance
 * loop); `heartbeat` drives the roster heartbeat. With both off, no agent runs.
 * On by default; the seed sets AUTONOMOUS_DISABLED so it stays idle there.
 */
@Injectable()
export class AgentRuntimeService {
  private autonomous = process.env.AUTONOMOUS_DISABLED !== 'true';
  private heartbeat = process.env.AUTONOMOUS_DISABLED !== 'true';

  isAutonomousEnabled(): boolean {
    return this.autonomous;
  }

  isHeartbeatEnabled(): boolean {
    return this.heartbeat;
  }

  /** True when every switch is off — no agent may run and no LLM call is made. */
  isAllOff(): boolean {
    return !this.autonomous && !this.heartbeat;
  }

  setAutonomous(enabled: boolean): boolean {
    this.autonomous = enabled;
    return enabled;
  }

  setHeartbeat(enabled: boolean): boolean {
    this.heartbeat = enabled;
    return enabled;
  }
}

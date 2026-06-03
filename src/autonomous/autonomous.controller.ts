import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutonomousService } from './autonomous.service';

@ApiTags('autonomous')
@Controller('autonomous')
export class AutonomousController {
  constructor(private readonly autonomous: AutonomousService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Autonomous engine status (enabled, tick count, cadence)',
  })
  status() {
    return this.autonomous.status();
  }

  @Get('activity')
  @ApiOperation({
    summary: 'Recent autonomous actions (what the agents did on their own)',
  })
  activity() {
    return this.autonomous.recentActivity();
  }

  @Post('toggle')
  @ApiOperation({ summary: 'Pause or resume the autonomous engine' })
  toggle(@Body('enabled') enabled: boolean) {
    return this.autonomous.setEnabled(enabled);
  }

  @Post('heartbeat-toggle')
  @ApiOperation({ summary: 'Pause or resume the heartbeat (roster) loop' })
  heartbeatToggle(@Body('enabled') enabled: boolean) {
    return this.autonomous.setHeartbeatEnabled(enabled);
  }

  @Post('tick')
  @ApiOperation({ summary: 'Run one autonomous tick now (demo acceleration)' })
  tick() {
    return this.autonomous.tick();
  }
}

import { Body, Controller, Get, Header, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List content-calendar integrations + connection status',
  })
  list() {
    return this.integrations.list();
  }

  @Get('calendar')
  @ApiOperation({
    summary:
      'Synced content calendar — connected external sources + their events. ' +
      'When a source is connected it is the source of truth; Hiive overlays it.',
  })
  calendar() {
    return this.integrations.calendar();
  }

  @Post(':provider/connect')
  @ApiOperation({ summary: 'Connect a content-calendar app' })
  connect(@Param('provider') provider: string) {
    return this.integrations.connect(provider);
  }

  @Post(':provider/disconnect')
  @ApiOperation({ summary: 'Disconnect a content-calendar app' })
  disconnect(@Param('provider') provider: string) {
    return this.integrations.disconnect(provider);
  }

  @Post(':provider/sync')
  @ApiOperation({ summary: 'Push the calendar out + pull external events' })
  sync(@Param('provider') provider: string) {
    return this.integrations.sync(provider);
  }

  @Post(':provider/publish')
  @ApiOperation({
    summary:
      'Publish a post through a connected publishing account (gated on credentials)',
  })
  publish(
    @Param('provider') provider: string,
    @Body('postId') postId: string,
  ) {
    return this.integrations.publish(provider, postId);
  }

  @Get('calendar.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="hiive-calendar.ics"')
  @ApiOperation({
    summary: 'Download the content calendar as iCalendar (.ics)',
  })
  ics() {
    return this.integrations.ics();
  }
}

@ApiTags('integrations')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Post('calendar')
  @ApiOperation({
    summary: 'Inbound webhook — an external tool pushes a change in',
  })
  inbound(
    @Body() payload: { type?: string; title?: string; platform?: string },
  ) {
    return this.integrations.webhook(payload);
  }
}

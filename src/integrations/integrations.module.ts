import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { CALENDAR_CONNECTORS } from './connectors/calendar-connector';
import {
  AsanaConnector,
  BufferConnector,
  GoogleCalendarConnector,
  NotionConnector,
} from './connectors/mock-connectors';
import { PUBLISH_CONNECTORS } from './connectors/publish-connector';
import {
  EmailPublishConnector,
  LinkedInPublishConnector,
  XPublishConnector,
} from './connectors/publish-connectors';
import {
  IntegrationsController,
  WebhooksController,
} from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [PostsModule],
  controllers: [IntegrationsController, WebhooksController],
  providers: [
    IntegrationsService,
    {
      // Real connector scaffolds — empty until keys are set and the stub is filled.
      provide: CALENDAR_CONNECTORS,
      useFactory: () => [
        new GoogleCalendarConnector(),
        new NotionConnector(),
        new AsanaConnector(),
        new BufferConnector(),
      ],
    },
    {
      // Publishing-account connectors the scheduler posts through.
      provide: PUBLISH_CONNECTORS,
      useFactory: () => [
        new LinkedInPublishConnector(),
        new XPublishConnector(),
        new EmailPublishConnector(),
      ],
    },
  ],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}

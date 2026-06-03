import { NotImplementedException } from '@nestjs/common';
import { Post } from '@prisma/client';
import { CalendarConnector, ExternalEvent } from './calendar-connector';

/**
 * Real connector scaffolds. The API calls are intentionally left as TODO stubs:
 * each reads its API key from env and, until that key is set AND the stub is
 * filled in, reports `configured: false` and throws NotImplemented rather than
 * faking a connection. Fill in `pushPosts` / `pullEvents` with the provider's
 * SDK/HTTP calls when you're ready.
 */
abstract class BaseConnector implements CalendarConnector {
  abstract readonly provider: string;
  abstract readonly label: string;
  /** Env var holding this provider's API key / access token. */
  abstract readonly requires: string;

  /** True once the API key/credentials are present in the environment. */
  get configured(): boolean {
    return Boolean(process.env[this.requires]?.trim());
  }

  protected get apiKey(): string {
    return process.env[this.requires]?.trim() ?? '';
  }

  protected notImplemented(): never {
    throw new NotImplementedException(
      `${this.label} integration is not implemented yet. Set ${this.requires} and fill in the connector.`,
    );
  }

  async pushPosts(_posts: Post[]): Promise<{ pushed: number }> {
    // TODO: push the content calendar to ${this.label} using this.apiKey.
    //   const res = await fetch('https://api.../events', {
    //     method: 'POST',
    //     headers: { Authorization: `Bearer ${this.apiKey}` },
    //     body: JSON.stringify(_posts.map(toEvent)),
    //   });
    return this.notImplemented();
  }

  async pullEvents(): Promise<ExternalEvent[]> {
    // TODO: read existing events from ${this.label} using this.apiKey.
    return this.notImplemented();
  }
}

export class GoogleCalendarConnector extends BaseConnector {
  readonly provider = 'google_calendar';
  readonly label = 'Google Calendar';
  readonly requires = 'GOOGLE_CALENDAR_API_KEY';
}

export class NotionConnector extends BaseConnector {
  readonly provider = 'notion';
  readonly label = 'Notion';
  readonly requires = 'NOTION_API_KEY';
}

export class AsanaConnector extends BaseConnector {
  readonly provider = 'asana';
  readonly label = 'Asana';
  readonly requires = 'ASANA_ACCESS_TOKEN';
}

export class BufferConnector extends BaseConnector {
  readonly provider = 'buffer';
  readonly label = 'Buffer';
  readonly requires = 'BUFFER_ACCESS_TOKEN';
}

import { Post } from '@prisma/client';

/**
 * Pluggable content-calendar connector. The real API calls are intentionally
 * left as TODO stubs — until an API key/credentials are configured (and the
 * stub is filled in), the connector reports as NOT configured and never fakes a
 * connection or fabricates events. Mirrors the LlmProvider abstraction.
 */
export interface ExternalEvent {
  id: string;
  title: string;
  date: string; // ISO
  source: string;
}

export interface CalendarConnector {
  readonly provider: string; // google_calendar | notion | asana | buffer
  readonly label: string;
  /** Whether the API key / credentials for this provider are present in env. */
  readonly configured: boolean;
  /** The env var that must be set to enable this provider (shown to the user). */
  readonly requires: string;
  /** Push the content calendar out to the external tool. */
  pushPosts(posts: Post[]): Promise<{ pushed: number }>;
  /** Pull events the marketer already has in the external tool. */
  pullEvents(): Promise<ExternalEvent[]>;
}

export const CALENDAR_CONNECTORS = Symbol('CALENDAR_CONNECTORS');

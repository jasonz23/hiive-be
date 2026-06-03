import { Post } from '@prisma/client';

/**
 * A publishing-account connector — what the scheduler uses to actually post to a
 * channel (LinkedIn / X / Email). Like the calendar connectors, the real API
 * call is a TODO stub: until the account's API keys are set AND the stub is
 * filled, the connector reports NOT configured and refuses to "post" anything.
 */
export interface PublishResult {
  externalId: string;
  url?: string;
}

export interface PublishConnector {
  readonly provider: string; // linkedin | x | email
  readonly label: string;
  readonly platform: string; // post platform this account posts to
  readonly requires: string;
  /** Whether the account's API credentials are present in env. */
  readonly configured: boolean;
  /** Publish a post to the connected account. */
  publish(post: Post): Promise<PublishResult>;
}

export const PUBLISH_CONNECTORS = Symbol('PUBLISH_CONNECTORS');

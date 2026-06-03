import { NotImplementedException } from '@nestjs/common';
import { Post } from '@prisma/client';
import { PublishConnector, PublishResult } from './publish-connector';

/**
 * Real publishing-account connectors. The `publish` API call is left as a TODO
 * stub: each reads its credentials from env and, until those are set AND the
 * stub is filled in, reports `configured: false` and throws NotImplemented
 * rather than pretending to post. Fill in `publish` with the channel's SDK/HTTP
 * call when credentials are available.
 */
abstract class BasePublishConnector implements PublishConnector {
  abstract readonly provider: string;
  abstract readonly label: string;
  abstract readonly platform: string;
  /** Primary env var (presence-checked); full credential set lives in the catalog. */
  abstract readonly requires: string;

  get configured(): boolean {
    return Boolean(process.env[this.requires]?.trim());
  }

  protected get credential(): string {
    return process.env[this.requires]?.trim() ?? '';
  }

  protected notImplemented(): never {
    throw new NotImplementedException(
      `${this.label} publishing is not implemented yet. Connect the ${this.label} account (set ${this.requires}) and fill in the connector.`,
    );
  }

  async publish(_post: Post): Promise<PublishResult> {
    // TODO: post `_post.copy` to ${this.label} using this.credential.
    //   const res = await fetch('https://api.../posts', {
    //     method: 'POST',
    //     headers: { Authorization: `Bearer ${this.credential}` },
    //     body: JSON.stringify({ text: _post.copy }),
    //   });
    //   return { externalId: res.id, url: res.permalink };
    return this.notImplemented();
  }
}

export class LinkedInPublishConnector extends BasePublishConnector {
  readonly provider = 'linkedin';
  readonly label = 'LinkedIn';
  readonly platform = 'LinkedIn';
  readonly requires = 'LINKEDIN_ACCESS_TOKEN';
}

export class XPublishConnector extends BasePublishConnector {
  readonly provider = 'x';
  readonly label = 'X (Twitter)';
  readonly platform = 'X';
  readonly requires = 'X_ACCESS_TOKEN';
}

export class EmailPublishConnector extends BasePublishConnector {
  readonly provider = 'email';
  readonly label = 'Email (Resend)';
  readonly platform = 'Email';
  readonly requires = 'EMAIL_PROVIDER_API_KEY';
}

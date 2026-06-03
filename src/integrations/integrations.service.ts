import {
  BadRequestException,
  Inject,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PostsService } from '../posts/posts.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CALENDAR_CONNECTORS,
  CalendarConnector,
} from './connectors/calendar-connector';
import {
  PUBLISH_CONNECTORS,
  PublishConnector,
} from './connectors/publish-connector';
import {
  CATEGORY_LABEL,
  findDefinition,
  INTEGRATION_CATALOG,
  IntegrationDefinition,
  isConfigured,
} from './integration-catalog';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly audit: AuditService,
    @Inject(CALENDAR_CONNECTORS)
    private readonly connectors: CalendarConnector[],
    @Inject(PUBLISH_CONNECTORS)
    private readonly publishers: PublishConnector[],
  ) {}

  /**
   * The full integration catalog with honest status. Driven by the catalog, so
   * adding a new integration is a single entry there — it appears here, grouped
   * by category, as `not_implemented` until its API keys are set.
   */
  async list() {
    const rows = await this.prisma.integration.findMany();
    const byProvider = new Map(rows.map((r) => [r.provider, r]));
    return INTEGRATION_CATALOG.map((def) => {
      const row = byProvider.get(def.provider);
      const configured = isConfigured(def);
      // Never report connected without keys, even if a stale row says so.
      const status = !configured
        ? 'not_implemented'
        : (row?.status ?? 'disconnected');
      return {
        provider: def.provider,
        label: def.label,
        category: def.category,
        categoryLabel: CATEGORY_LABEL[def.category],
        platform: def.platform ?? null,
        capabilities: def.capabilities,
        requires: def.requires,
        docsUrl: def.docsUrl,
        configured,
        status,
        lastSyncAt: configured ? (row?.lastSyncAt ?? null) : null,
      };
    });
  }

  /**
   * Publish a post through a connected publishing account (LinkedIn / X / Email).
   * The connector code is implemented but gated: without the account's API keys
   * (and a filled-in connector) it stays disabled and throws NotImplemented —
   * the scheduler falls back to simulated publishing until an account is live.
   */
  async publish(provider: string, postId: string) {
    const def = this.definition(provider);
    if (def.category !== 'publishing') {
      throw new BadRequestException(`${def.label} is not a publishing account`);
    }
    if (!isConfigured(def)) {
      throw new BadRequestException(this.notReadyMessage(def));
    }
    const connector = this.publishers.find((p) => p.provider === provider);
    if (!connector) {
      throw new NotImplementedException(
        `${def.label} publishing connector is not built yet.`,
      );
    }
    const post = await this.posts.findOne(postId);
    return connector.publish(post);
  }

  /** Which post platforms have a live (configured) publishing account. */
  publishablePlatforms(): string[] {
    return INTEGRATION_CATALOG.filter(
      (d) => d.category === 'publishing' && d.platform && isConfigured(d),
    ).map((d) => d.platform as string);
  }

  connect(provider: string) {
    const def = this.definition(provider);
    if (!isConfigured(def)) {
      throw new BadRequestException(this.notReadyMessage(def));
    }
    return this.upsert(provider, 'connected');
  }

  disconnect(provider: string) {
    this.definition(provider);
    return this.upsert(provider, 'disconnected');
  }

  /** Push the content calendar out + pull external events from the tool. */
  async sync(provider: string) {
    const def = this.definition(provider);
    if (!isConfigured(def)) {
      throw new BadRequestException(this.notReadyMessage(def));
    }
    const integration = await this.prisma.integration.findUnique({
      where: { provider },
    });
    if (integration?.status !== 'connected') {
      throw new BadRequestException(`${def.label} is not connected`);
    }
    // Only the content-calendar category has a connector implementation today;
    // every other integration is honestly "not implemented yet" until built.
    const connector = this.calendarConnector(provider);
    if (!connector) {
      throw new NotImplementedException(
        `${def.label} sync is not implemented yet — its connector hasn't been built.`,
      );
    }
    const posts = await this.posts.findAll();
    const { pushed } = await connector.pushPosts(posts);
    const events = await connector.pullEvents();
    await this.upsert(provider, 'connected', new Date());
    await this.audit.record({
      actor: 'IntegrationsService',
      action: 'integration.sync',
      entity: 'Integration',
      entityId: provider,
      metadata: { pushed, pulled: events.length },
    });
    return { provider, label: def.label, pushed, events };
  }

  /** Real iCalendar export of the content calendar (no keys, no library). */
  async ics(): Promise<string> {
    const posts = await this.posts.findAll();
    const events = posts
      .filter((p) => p.scheduledAt)
      .map((p) =>
        this.vevent(
          p.id,
          p.scheduledAt as Date,
          `${p.platform}: ${p.copy.split('\n')[0]}`,
        ),
      );
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Hiive//Content Calendar//EN',
      'CALSCALE:GREGORIAN',
      ...events,
      'END:VCALENDAR',
    ].join('\r\n');
  }

  /** Inbound webhook — an external tool pushing a change in (mock). */
  async webhook(payload: { type?: string; title?: string; platform?: string }) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { status: 'active' },
    });
    if (!campaign) return { ok: false, reason: 'no active campaign' };
    const post = await this.posts.create({
      campaignId: campaign.id,
      platform: payload.platform ?? 'LinkedIn',
      copy: payload.title ?? 'Imported from external calendar',
      status: 'draft',
    });
    await this.audit.record({
      actor: 'webhook',
      action: 'integration.inbound',
      entity: 'Post',
      entityId: post.id,
      metadata: payload,
    });
    return { ok: true, postId: post.id };
  }

  /**
   * The synced view of the content calendar. When external sources are
   * connected, their events are the source of truth and Hiive's calendar is a
   * secondary overlay — this returns the connected sources + their pulled
   * events so the UI can show what the marketer's tools already hold.
   */
  async calendar() {
    const rows = await this.prisma.integration.findMany();
    const connectedRows = new Set(
      rows.filter((r) => r.status === 'connected').map((r) => r.provider),
    );
    const sources = this.connectors.map((c) => ({
      provider: c.provider,
      label: c.label,
      configured: c.configured,
      // Only truly connected when the API key is present AND it was connected.
      connected: c.configured && connectedRows.has(c.provider),
      status: !c.configured
        ? 'not_implemented'
        : connectedRows.has(c.provider)
          ? 'connected'
          : 'disconnected',
    }));

    const connected = this.connectors.filter(
      (c) => c.configured && connectedRows.has(c.provider),
    );
    // pullEvents may still be an unimplemented stub — never fabricate, just skip.
    const eventLists = await Promise.all(
      connected.map(async (c) => {
        try {
          return await c.pullEvents();
        } catch {
          return [];
        }
      }),
    );
    const events = eventLists
      .flat()
      .sort((a, b) => a.date.localeCompare(b.date));

    return { sources, events, hasExternalSource: connected.length > 0 };
  }

  // --- internals -----------------------------------------------------------

  private definition(provider: string): IntegrationDefinition {
    const def = findDefinition(provider);
    if (!def) throw new BadRequestException(`Unknown provider: ${provider}`);
    return def;
  }

  /** The content-calendar connector for a provider, if one is built. */
  private calendarConnector(provider: string): CalendarConnector | undefined {
    return this.connectors.find((c) => c.provider === provider);
  }

  private notReadyMessage(def: IntegrationDefinition): string {
    return `${def.label} is not implemented yet — set ${def.requires.join(', ')} (and fill in its connector) to enable it.`;
  }

  private upsert(provider: string, status: string, lastSyncAt?: Date) {
    return this.prisma.integration.upsert({
      where: { provider },
      update: { status, lastSyncAt },
      create: { provider, status, lastSyncAt },
    });
  }

  private vevent(uid: string, date: Date, summary: string): string {
    const dt = this.toICalDate(new Date(date));
    const end = this.toICalDate(
      new Date(new Date(date).getTime() + 30 * 60000),
    );
    return [
      'BEGIN:VEVENT',
      `UID:${uid}@hiive`,
      `DTSTAMP:${dt}`,
      `DTSTART:${dt}`,
      `DTEND:${end}`,
      `SUMMARY:${summary.replace(/[\r\n,]/g, ' ')}`,
      'END:VEVENT',
    ].join('\r\n');
  }

  private toICalDate(d: Date): string {
    return d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }
}

/**
 * The integration catalog — the single, flexible place to register integrations
 * Hiive can plug into. Adding a new integration is ONE entry here; it then shows
 * up across the API + UI with honest status (not_implemented until its API keys
 * are set and its connector is filled in). Grouped by the categories a buy-side /
 * sell-side marketing team actually uses.
 */
export type IntegrationCategory =
  | 'publishing'
  | 'crm'
  | 'marketing_automation'
  | 'analytics'
  | 'attribution'
  | 'sales_engagement'
  | 'bi_reporting'
  | 'content_calendar';

export const CATEGORY_LABEL: Record<IntegrationCategory, string> = {
  publishing: 'Publishing Accounts',
  crm: 'CRM (Source of Truth)',
  marketing_automation: 'Marketing Automation',
  analytics: 'Product & Website Analytics',
  attribution: 'Attribution & Ad Tracking',
  sales_engagement: 'Sales Engagement',
  bi_reporting: 'BI & Reporting',
  content_calendar: 'Content Calendar',
};

// Display order for the UI.
export const CATEGORY_ORDER: IntegrationCategory[] = [
  'publishing',
  'crm',
  'marketing_automation',
  'analytics',
  'attribution',
  'sales_engagement',
  'bi_reporting',
  'content_calendar',
];

export interface IntegrationDefinition {
  provider: string;
  label: string;
  category: IntegrationCategory;
  /** Env vars that must ALL be present for the integration to be usable. */
  requires: string[];
  /** What this integration would feed Hiive (buy-side / sell-side marketing data). */
  capabilities: string[];
  docsUrl: string;
  /** For publishing accounts: the post platform this account publishes to. */
  platform?: string;
}

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  // --- Publishing accounts — the channels the scheduler posts to ----------
  {
    provider: 'linkedin',
    label: 'LinkedIn',
    category: 'publishing',
    platform: 'LinkedIn',
    requires: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN'],
    capabilities: ['Publish posts', 'Schedule posts'],
    docsUrl: 'https://learn.microsoft.com/linkedin/marketing',
  },
  {
    provider: 'x',
    label: 'X (Twitter)',
    category: 'publishing',
    platform: 'X',
    requires: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'],
    capabilities: ['Publish posts', 'Schedule posts'],
    docsUrl: 'https://developer.twitter.com',
  },
  {
    provider: 'email',
    label: 'Email (Resend)',
    category: 'publishing',
    platform: 'Email',
    requires: ['EMAIL_PROVIDER_API_KEY'],
    capabilities: ['Send campaigns', 'Schedule sends'],
    docsUrl: 'https://resend.com',
  },

  // --- CRM — leads, opportunities, conversions, pipeline -------------------
  {
    provider: 'salesforce',
    label: 'Salesforce',
    category: 'crm',
    requires: ['SALESFORCE_CLIENT_ID', 'SALESFORCE_CLIENT_SECRET', 'SALESFORCE_REFRESH_TOKEN'],
    capabilities: ['Leads & pipeline', 'Qualified prospects', 'Conversions (bought/sold)', 'Revenue (transaction fees)', 'Time to conversion'],
    docsUrl: 'https://www.salesforce.com',
  },
  {
    provider: 'hubspot_crm',
    label: 'HubSpot CRM',
    category: 'crm',
    requires: ['HUBSPOT_ACCESS_TOKEN'],
    capabilities: ['Leads & pipeline', 'Qualified prospects', 'Conversions', 'Time to conversion'],
    docsUrl: 'https://www.hubspot.com',
  },
  {
    provider: 'pipedrive',
    label: 'Pipedrive',
    category: 'crm',
    requires: ['PIPEDRIVE_API_TOKEN'],
    capabilities: ['Leads & pipeline', 'Deals', 'Conversions'],
    docsUrl: 'https://www.pipedrive.com',
  },

  // --- Marketing Automation — nurture flows, lifecycle, lead scoring -------
  {
    provider: 'hubspot_marketing',
    label: 'HubSpot Marketing Hub',
    category: 'marketing_automation',
    requires: ['HUBSPOT_ACCESS_TOKEN'],
    capabilities: ['Nurture flows', 'Email campaigns', 'Lead scoring', 'Lifecycle stage'],
    docsUrl: 'https://www.hubspot.com/products/marketing',
  },
  {
    provider: 'marketo',
    label: 'Marketo',
    category: 'marketing_automation',
    requires: ['MARKETO_CLIENT_ID', 'MARKETO_CLIENT_SECRET', 'MARKETO_BASE_URL'],
    capabilities: ['Nurture flows', 'Email campaigns', 'Lead scoring'],
    docsUrl: 'https://www.adobe.com/products/marketo.html',
  },
  {
    provider: 'customer_io',
    label: 'Customer.io',
    category: 'marketing_automation',
    requires: ['CUSTOMERIO_API_KEY', 'CUSTOMERIO_SITE_ID'],
    capabilities: ['Lifecycle messaging', 'Nurture sequences', 'Event-triggered flows'],
    docsUrl: 'https://customer.io',
  },
  {
    provider: 'braze',
    label: 'Braze',
    category: 'marketing_automation',
    requires: ['BRAZE_API_KEY', 'BRAZE_INSTANCE_URL'],
    capabilities: ['Lifecycle messaging', 'Multichannel campaigns'],
    docsUrl: 'https://www.braze.com',
  },

  // --- Product & Website Analytics — funnels & activation -----------------
  {
    provider: 'ga4',
    label: 'Google Analytics 4',
    category: 'analytics',
    requires: ['GA4_PROPERTY_ID', 'GA4_CREDENTIALS_JSON'],
    capabilities: ['Landing conversion', 'Signup rate', 'KYC completion', 'Activation (funded / listed)'],
    docsUrl: 'https://analytics.google.com',
  },
  {
    provider: 'mixpanel',
    label: 'Mixpanel',
    category: 'analytics',
    requires: ['MIXPANEL_PROJECT_TOKEN', 'MIXPANEL_API_SECRET'],
    capabilities: ['Conversion funnels', 'Buyer activation rate', 'Seller listing rate'],
    docsUrl: 'https://mixpanel.com',
  },
  {
    provider: 'amplitude',
    label: 'Amplitude',
    category: 'analytics',
    requires: ['AMPLITUDE_API_KEY', 'AMPLITUDE_SECRET_KEY'],
    capabilities: ['Conversion funnels', 'Retention', 'Activation'],
    docsUrl: 'https://amplitude.com',
  },
  {
    provider: 'posthog',
    label: 'PostHog',
    category: 'analytics',
    requires: ['POSTHOG_API_KEY', 'POSTHOG_HOST'],
    capabilities: ['Conversion funnels', 'Signup rate', 'Activation'],
    docsUrl: 'https://posthog.com',
  },

  // --- Attribution & Ad Tracking — which channels generate quality leads --
  {
    provider: 'google_ads',
    label: 'Google Ads',
    category: 'attribution',
    requires: ['GOOGLE_ADS_DEVELOPER_TOKEN', 'GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'],
    capabilities: ['Cost per qualified buyer', 'Cost per qualified seller', 'Cost per transaction'],
    docsUrl: 'https://ads.google.com',
  },
  {
    provider: 'linkedin_ads',
    label: 'LinkedIn Ads',
    category: 'attribution',
    requires: ['LINKEDIN_ADS_ACCESS_TOKEN', 'LINKEDIN_ADS_ACCOUNT_ID'],
    capabilities: ['Cost per qualified lead', 'Channel quality by segment'],
    docsUrl: 'https://business.linkedin.com/marketing-solutions/ads',
  },
  {
    provider: 'meta_ads',
    label: 'Meta Ads Manager',
    category: 'attribution',
    requires: ['META_ADS_ACCESS_TOKEN', 'META_ADS_ACCOUNT_ID'],
    capabilities: ['Cost per lead', 'Channel quality'],
    docsUrl: 'https://www.facebook.com/business/tools/ads-manager',
  },
  {
    provider: 'dreamdata',
    label: 'Dreamdata',
    category: 'attribution',
    requires: ['DREAMDATA_API_KEY'],
    capabilities: ['Multi-touch attribution', 'Cost per qualified buyer/seller', 'Pipeline by channel'],
    docsUrl: 'https://dreamdata.io',
  },

  // --- Sales Engagement — BD outbound to prospects ------------------------
  {
    provider: 'apollo',
    label: 'Apollo',
    category: 'sales_engagement',
    requires: ['APOLLO_API_KEY'],
    capabilities: ['Prospecting', 'Outbound sequences', 'Reply / meeting rates'],
    docsUrl: 'https://www.apollo.io',
  },
  {
    provider: 'outreach',
    label: 'Outreach',
    category: 'sales_engagement',
    requires: ['OUTREACH_ACCESS_TOKEN'],
    capabilities: ['Outbound sequences', 'Engagement tracking'],
    docsUrl: 'https://www.outreach.io',
  },
  {
    provider: 'salesloft',
    label: 'Salesloft',
    category: 'sales_engagement',
    requires: ['SALESLOFT_API_KEY'],
    capabilities: ['Cadences', 'Engagement tracking'],
    docsUrl: 'https://www.salesloft.com',
  },

  // --- BI & Reporting — combine marketing + transaction data --------------
  {
    provider: 'looker_studio',
    label: 'Looker Studio',
    category: 'bi_reporting',
    requires: ['LOOKER_OAUTH_CREDENTIALS'],
    capabilities: ['Blended dashboards', 'Marketing + transaction reporting'],
    docsUrl: 'https://lookerstudio.google.com',
  },
  {
    provider: 'tableau',
    label: 'Tableau',
    category: 'bi_reporting',
    requires: ['TABLEAU_PAT_NAME', 'TABLEAU_PAT_SECRET', 'TABLEAU_SERVER_URL'],
    capabilities: ['Blended dashboards', 'Executive reporting'],
    docsUrl: 'https://www.tableau.com',
  },
  {
    provider: 'metabase',
    label: 'Metabase',
    category: 'bi_reporting',
    requires: ['METABASE_API_KEY', 'METABASE_SITE_URL'],
    capabilities: ['Self-serve dashboards', 'SQL reporting'],
    docsUrl: 'https://www.metabase.com',
  },

  // --- Content Calendar — push the calendar out / pull events in ----------
  {
    provider: 'google_calendar',
    label: 'Google Calendar',
    category: 'content_calendar',
    requires: ['GOOGLE_CALENDAR_API_KEY'],
    capabilities: ['Push calendar', 'Pull events'],
    docsUrl: 'https://calendar.google.com',
  },
  {
    provider: 'notion',
    label: 'Notion',
    category: 'content_calendar',
    requires: ['NOTION_API_KEY'],
    capabilities: ['Push calendar', 'Pull events'],
    docsUrl: 'https://www.notion.so',
  },
  {
    provider: 'asana',
    label: 'Asana',
    category: 'content_calendar',
    requires: ['ASANA_ACCESS_TOKEN'],
    capabilities: ['Push calendar', 'Pull task due-dates'],
    docsUrl: 'https://www.asana.com',
  },
  {
    provider: 'buffer',
    label: 'Buffer',
    category: 'content_calendar',
    requires: ['BUFFER_ACCESS_TOKEN'],
    capabilities: ['Push calendar', 'Schedule posts'],
    docsUrl: 'https://buffer.com',
  },
];

const BY_PROVIDER = new Map(INTEGRATION_CATALOG.map((d) => [d.provider, d]));

export function findDefinition(provider: string): IntegrationDefinition | undefined {
  return BY_PROVIDER.get(provider);
}

/** Configured = every required env var is present. No fabrication without keys. */
export function isConfigured(def: IntegrationDefinition): boolean {
  return def.requires.every((k) => Boolean(process.env[k]?.trim()));
}

-- Hiive — SQL seed (data only, agents OFF).
--
-- This populates campaigns, posts and ads via plain INSERTs — no agent runs, no
-- LLM/embedding calls. Because nothing here triggers the orchestrator, the
-- agents stay idle. To keep the autonomous engine from starting after seeding,
-- run the app with AUTONOMOUS_DISABLED=true (or flip the Engine toggles in the
-- Settings app to off). Memory/RAG (vector embeddings) is NOT seeded here — it
-- requires the embedding model; use `npm run db:seed` for that.
--
-- Run with:  npm run db:seed:sql   (or: psql "$DATABASE_URL" -f prisma/seed.sql)

BEGIN;

-- Clean slate for the data we seed + any prior agent activity (agents off).
-- Campaign CASCADE clears posts, ads, recommendations, comments, audience.
-- AgentRun CASCADE clears steps + reflections.
TRUNCATE TABLE "Campaign", "AgentRun" RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------------------
-- Campaigns (buy-side, sell-side, employee) — all active.
-- ---------------------------------------------------------------------------
INSERT INTO "Campaign"
  ("id", "name", "objective", "audience", "status", "health", "channels", "budget", "startDate", "endDate", "goals", "createdAt", "updatedAt")
VALUES
  ('cmp_sell', 'Sell-side Founder Liquidity', 'Increase inbound sellers of pre-IPO shares',
   'Startup founders and early employees', 'active', 'healthy',
   ARRAY['LinkedIn','X','Email'], 30000, now() - interval '30 days', now() + interval '30 days',
   '{"impressions":50000,"clicks":1500,"leads":100}'::jsonb, now() - interval '30 days', now()),

  ('cmp_buy', 'Buy-side Investor Access', 'Grow accredited investor signups for pre-IPO access',
   'Accredited investors and funds', 'active', 'warning',
   ARRAY['LinkedIn','Email'], 20000, now() - interval '24 days', now() + interval '36 days',
   '{"impressions":150000,"clicks":5000,"leads":250}'::jsonb, now() - interval '24 days', now()),

  ('cmp_emp', 'Employee Liquidity Education', 'Educate startup employees on liquidity options',
   'Startup employees with vested equity', 'active', 'healthy',
   ARRAY['LinkedIn','X'], 12000, now() - interval '18 days', now() + interval '42 days',
   '{"impressions":300000,"clicks":10000,"leads":500}'::jsonb, now() - interval '18 days', now());

-- ---------------------------------------------------------------------------
-- Posts — a mix of pipeline stages; published/completed carry metrics.
-- ---------------------------------------------------------------------------
INSERT INTO "Post"
  ("id", "campaignId", "platform", "copy", "status", "scheduledAt", "publishedAt", "metrics", "metricsHistory", "createdAt", "updatedAt")
VALUES
  -- Sell-side
  ('post_01', 'cmp_sell', 'LinkedIn',
   'Founders: understand what your equity is worth before the IPO window closes.',
   'published', now() - interval '6 days', now() - interval '6 days',
   '{"impressions":42000,"likes":840,"comments":168,"shares":84,"clicks":1100,"conversions":88,"ctr":2.62}'::jsonb,
   '[{"capturedAt":"2026-05-28T10:00:00.000Z","impressions":21000,"clicks":540,"ctr":2.57,"conversions":44},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":42000,"clicks":1100,"ctr":2.62,"conversions":88}]'::jsonb,
   now() - interval '8 days', now()),

  ('post_02', 'cmp_sell', 'X',
   'Pre-IPO doesn''t have to mean pre-liquidity. See your options.',
   'completed', now() - interval '14 days', now() - interval '14 days',
   '{"impressions":9000,"likes":180,"comments":36,"shares":18,"clicks":82,"conversions":4,"ctr":0.91}'::jsonb,
   '[{"capturedAt":"2026-05-20T10:00:00.000Z","impressions":4500,"clicks":40,"ctr":0.89,"conversions":2},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":9000,"clicks":82,"ctr":0.91,"conversions":4}]'::jsonb,
   now() - interval '16 days', now()),

  ('post_03', 'cmp_sell', 'LinkedIn',
   'Your hardest exit decision starts now, not at the bell. Here''s how to think about it.',
   'scheduled', now() + interval '2 days', NULL, NULL, NULL, now() - interval '2 days', now()),

  ('post_04', 'cmp_sell', 'Email',
   'A confidential, no-pressure valuation of your founder shares.',
   'review', now() + interval '3 days', NULL, NULL, NULL, now() - interval '1 day', now()),

  ('post_05', 'cmp_sell', 'LinkedIn',
   'What if you could understand your options before the lock-up ends?',
   'draft', NULL, NULL, NULL, NULL, now() - interval '1 day', now()),

  -- Buy-side
  ('post_06', 'cmp_buy', 'Email',
   'Accredited investors: access vetted pre-IPO opportunities with transparent pricing.',
   'published', now() - interval '5 days', now() - interval '5 days',
   '{"impressions":18000,"likes":120,"comments":60,"shares":20,"clicks":560,"conversions":78,"ctr":3.11}'::jsonb,
   '[{"capturedAt":"2026-05-29T10:00:00.000Z","impressions":9000,"clicks":270,"ctr":3.0,"conversions":38},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":18000,"clicks":560,"ctr":3.11,"conversions":78}]'::jsonb,
   now() - interval '7 days', now()),

  ('post_07', 'cmp_buy', 'LinkedIn',
   'Build a diversified pre-IPO portfolio. Vetted companies, transparent pricing.',
   'published', now() - interval '9 days', now() - interval '9 days',
   '{"impressions":33000,"likes":300,"comments":50,"shares":40,"clicks":600,"conversions":30,"ctr":1.82}'::jsonb,
   '[{"capturedAt":"2026-05-25T10:00:00.000Z","impressions":16500,"clicks":300,"ctr":1.82,"conversions":15},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":33000,"clicks":600,"ctr":1.82,"conversions":30}]'::jsonb,
   now() - interval '11 days', now()),

  ('post_08', 'cmp_buy', 'Email',
   'Your next allocation: secondary shares in late-stage leaders.',
   'approved', now() + interval '1 day', NULL, NULL, NULL, now() - interval '1 day', now()),

  -- Employee
  ('post_09', 'cmp_emp', 'LinkedIn',
   'Your vested equity has options — here''s how to think about them.',
   'published', now() - interval '4 days', now() - interval '4 days',
   '{"impressions":56000,"likes":900,"comments":140,"shares":110,"clicks":1010,"conversions":40,"ctr":1.80}'::jsonb,
   '[{"capturedAt":"2026-05-30T10:00:00.000Z","impressions":28000,"clicks":500,"ctr":1.79,"conversions":20},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":56000,"clicks":1010,"ctr":1.80,"conversions":40}]'::jsonb,
   now() - interval '6 days', now()),

  ('post_10', 'cmp_emp', 'X',
   'Vesting cliff coming up? Know your liquidity options before you decide.',
   'draft', NULL, NULL, NULL, NULL, now(), now());

-- ---------------------------------------------------------------------------
-- Ads — active, with totals (CTR/CPC/CPA derived at read time).
-- ---------------------------------------------------------------------------
INSERT INTO "AdCampaign"
  ("id", "campaignId", "name", "platform", "budget", "spend", "impressions", "clicks", "conversions", "status", "startDate", "endDate", "createdAt", "updatedAt")
VALUES
  ('ad_01', 'cmp_sell', 'Sell-side Founder Liquidity — LinkedIn', 'LinkedIn', 8000, 5200, 62000, 1240, 58, 'active', now() - interval '29 days', now() + interval '10 days', now() - interval '29 days', now()),
  ('ad_02', 'cmp_sell', 'Sell-side Founder Liquidity — X', 'X', 4000, 2600, 38000, 420, 12, 'active', now() - interval '29 days', now() + interval '10 days', now() - interval '29 days', now()),
  ('ad_03', 'cmp_buy', 'Buy-side Investor Access — LinkedIn', 'LinkedIn', 9000, 6100, 71000, 1490, 96, 'active', now() - interval '23 days', now() + interval '14 days', now() - interval '23 days', now()),
  ('ad_04', 'cmp_emp', 'Employee Liquidity Education — LinkedIn', 'LinkedIn', 5000, 3100, 48000, 760, 28, 'active', now() - interval '17 days', now() + interval '20 days', now() - interval '17 days', now());

COMMIT;

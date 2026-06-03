-- Hiive — full demo SQL seed (data only, agents OFF).
--
-- Populates every surface of the app with realistic data via plain INSERTs —
-- NO live agent runs and NO LLM/embedding API calls. It seeds *historical* agent
-- runs/steps/reflections so the agent rail, health, and timelines look alive,
-- but nothing here starts the engine. To keep the autonomous engine idle after
-- seeding, run the backend with AUTONOMOUS_DISABLED=true (or flip the Engine
-- toggles off in Settings).
--
-- Memory chunks get a uniform placeholder embedding so the Memory app, the
-- timeline AND semantic search all work (search ranks by importance/recency).
--
-- Run with:  npm run db:seed:sql   (or: psql "$DATABASE_URL" -f prisma/seed.sql)

BEGIN;

-- Clean slate (roots + CASCADE clears all dependents and prior agent activity).
TRUNCATE TABLE
  "Mission", "Campaign", "AgentRun", "FileAsset", "MemoryChunk", "KnowledgeNode"
RESTART IDENTITY CASCADE;

-- ===========================================================================
-- Mission
-- ===========================================================================
INSERT INTO "Mission" ("id","title","objective","status","priority","targetMetric","plan","createdAt","updatedAt") VALUES
('mis_sell','Grow sell-side founder leads 30%','Increase qualified founder/seller leads by 30% this quarter','executing','high',
 '{"metric":"founder_leads","baseline":100,"target":130,"unit":"leads"}'::jsonb,
 '[{"order":1,"agent":"CampaignStrategyAgent","action":"Define sell-side positioning","requiresApproval":false},{"order":2,"agent":"ContentGenerationAgent","action":"Draft LinkedIn + email content","requiresApproval":false},{"order":3,"agent":"ComplianceReviewAgent","action":"Compliance review","requiresApproval":false},{"order":4,"agent":"SocialSimulationSwarmAgent","action":"Pre-flight simulation","requiresApproval":true}]'::jsonb,
 now() - interval '20 days', now());

-- ===========================================================================
-- Campaigns (buy-side, sell-side, employee)
-- ===========================================================================
INSERT INTO "Campaign"
  ("id","missionId","name","objective","audience","status","health","channels","budget","startDate","endDate","goals","createdAt","updatedAt")
VALUES
  ('cmp_sell','mis_sell','Sell-side Founder Liquidity','Increase inbound sellers of pre-IPO shares',
   'Startup founders and early employees','active','healthy',
   ARRAY['LinkedIn','X','Email'],30000, now() - interval '30 days', now() + interval '30 days',
   '{"impressions":50000,"clicks":1500,"leads":100}'::jsonb, now() - interval '30 days', now()),
  ('cmp_buy',NULL,'Buy-side Investor Access','Grow accredited investor signups for pre-IPO access',
   'Accredited investors and funds','active','warning',
   ARRAY['LinkedIn','Email'],20000, now() - interval '24 days', now() + interval '36 days',
   '{"impressions":150000,"clicks":5000,"leads":250}'::jsonb, now() - interval '24 days', now()),
  ('cmp_emp',NULL,'Employee Liquidity Education','Educate startup employees on liquidity options',
   'Startup employees with vested equity','active','healthy',
   ARRAY['LinkedIn','X'],12000, now() - interval '18 days', now() + interval '42 days',
   '{"impressions":300000,"clicks":10000,"leads":500}'::jsonb, now() - interval '18 days', now());

-- ===========================================================================
-- Posts (mix of stages; published/completed carry metrics + trajectory)
-- ===========================================================================
INSERT INTO "Post"
  ("id","campaignId","platform","copy","status","scheduledAt","publishedAt","metrics","metricsHistory","createdAt","updatedAt")
VALUES
  ('post_01','cmp_sell','LinkedIn','Founders: understand what your equity is worth before the IPO window closes.',
   'published', now() - interval '6 days', now() - interval '6 days',
   '{"impressions":42000,"likes":840,"comments":168,"shares":84,"clicks":1100,"conversions":88,"ctr":2.62}'::jsonb,
   '[{"capturedAt":"2026-05-28T10:00:00.000Z","impressions":21000,"clicks":540,"ctr":2.57,"conversions":44},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":42000,"clicks":1100,"ctr":2.62,"conversions":88}]'::jsonb,
   now() - interval '8 days', now()),
  ('post_02','cmp_sell','X','Pre-IPO doesn''t have to mean pre-liquidity. See your options.',
   'completed', now() - interval '14 days', now() - interval '14 days',
   '{"impressions":9000,"likes":180,"comments":36,"shares":18,"clicks":82,"conversions":4,"ctr":0.91}'::jsonb,
   '[{"capturedAt":"2026-05-20T10:00:00.000Z","impressions":4500,"clicks":40,"ctr":0.89,"conversions":2},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":9000,"clicks":82,"ctr":0.91,"conversions":4}]'::jsonb,
   now() - interval '16 days', now()),
  ('post_03','cmp_sell','LinkedIn','Your hardest exit decision starts now, not at the bell. Here''s how to think about it.',
   'scheduled', now() + interval '2 days', NULL, NULL, NULL, now() - interval '2 days', now()),
  ('post_04','cmp_sell','Email','A confidential, no-pressure valuation of your founder shares.',
   'review', now() + interval '3 days', NULL, NULL, NULL, now() - interval '1 day', now()),
  ('post_05','cmp_sell','LinkedIn','What if you could understand your options before the lock-up ends?',
   'draft', NULL, NULL, NULL, NULL, now() - interval '1 day', now()),
  ('post_06','cmp_buy','Email','Accredited investors: access vetted pre-IPO opportunities with transparent pricing.',
   'published', now() - interval '5 days', now() - interval '5 days',
   '{"impressions":18000,"likes":120,"comments":60,"shares":20,"clicks":560,"conversions":78,"ctr":3.11}'::jsonb,
   '[{"capturedAt":"2026-05-29T10:00:00.000Z","impressions":9000,"clicks":270,"ctr":3.0,"conversions":38},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":18000,"clicks":560,"ctr":3.11,"conversions":78}]'::jsonb,
   now() - interval '7 days', now()),
  ('post_07','cmp_buy','LinkedIn','Build a diversified pre-IPO portfolio. Vetted companies, transparent pricing.',
   'underperforming', now() - interval '9 days', now() - interval '9 days',
   '{"impressions":33000,"likes":300,"comments":50,"shares":40,"clicks":600,"conversions":30,"ctr":1.82}'::jsonb,
   '[{"capturedAt":"2026-05-25T10:00:00.000Z","impressions":16500,"clicks":300,"ctr":1.82,"conversions":15},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":33000,"clicks":600,"ctr":1.82,"conversions":30}]'::jsonb,
   now() - interval '11 days', now()),
  ('post_08','cmp_buy','Email','Your next allocation: secondary shares in late-stage leaders.',
   'approved', now() + interval '1 day', NULL, NULL, NULL, now() - interval '1 day', now()),
  ('post_09','cmp_emp','LinkedIn','Your vested equity has options — here''s how to think about them.',
   'published', now() - interval '4 days', now() - interval '4 days',
   '{"impressions":56000,"likes":900,"comments":140,"shares":110,"clicks":1010,"conversions":40,"ctr":1.80}'::jsonb,
   '[{"capturedAt":"2026-05-30T10:00:00.000Z","impressions":28000,"clicks":500,"ctr":1.79,"conversions":20},{"capturedAt":"2026-06-03T10:00:00.000Z","impressions":56000,"clicks":1010,"ctr":1.80,"conversions":40}]'::jsonb,
   now() - interval '6 days', now()),
  ('post_10','cmp_emp','X','Vesting cliff coming up? Know your liquidity options before you decide.',
   'draft', NULL, NULL, NULL, NULL, now(), now());

-- ---------------------------------------------------------------------------
-- June 2026 content calendar — many posts dated across the current month so the
-- calendar month view is full (clustered around June 1). Published ones (early
-- June) carry metrics; the rest are scheduled/approved/review/draft.
-- ---------------------------------------------------------------------------
INSERT INTO "Post"
  ("id","campaignId","platform","copy","status","scheduledAt","publishedAt","metrics","metricsHistory","createdAt","updatedAt")
VALUES
  ('pj_01','cmp_sell','LinkedIn','Founders: understand your equity before the IPO window closes.','published','2026-06-01 09:00','2026-06-01 09:00',
   '{"impressions":38000,"likes":760,"comments":152,"shares":76,"clicks":980,"conversions":70,"ctr":2.58}'::jsonb,
   '[{"capturedAt":"2026-06-01T09:00:00.000Z","impressions":19000,"clicks":480,"ctr":2.53,"conversions":34},{"capturedAt":"2026-06-03T09:00:00.000Z","impressions":38000,"clicks":980,"ctr":2.58,"conversions":70}]'::jsonb,
   '2026-05-30 12:00','2026-06-03 09:00'),
  ('pj_02','cmp_buy','Email','Accredited investors: vetted pre-IPO access, transparent pricing.','published','2026-06-01 11:30','2026-06-01 11:30',
   '{"impressions":16000,"likes":110,"comments":54,"shares":18,"clicks":510,"conversions":70,"ctr":3.19}'::jsonb,
   '[{"capturedAt":"2026-06-01T11:30:00.000Z","impressions":8000,"clicks":250,"ctr":3.13,"conversions":34},{"capturedAt":"2026-06-03T11:30:00.000Z","impressions":16000,"clicks":510,"ctr":3.19,"conversions":70}]'::jsonb,
   '2026-05-30 12:00','2026-06-03 11:30'),
  ('pj_03','cmp_emp','X','Your vested equity has options — here''s how to think about them.','scheduled','2026-06-01 14:00',NULL,NULL,NULL,'2026-05-29 12:00','2026-05-29 12:00'),
  ('pj_04','cmp_sell','X','Pre-IPO doesn''t have to mean pre-liquidity.','published','2026-06-02 09:30','2026-06-02 09:30',
   '{"impressions":8500,"likes":170,"comments":34,"shares":17,"clicks":80,"conversions":4,"ctr":0.94}'::jsonb,
   '[{"capturedAt":"2026-06-02T09:30:00.000Z","impressions":4200,"clicks":40,"ctr":0.95,"conversions":2},{"capturedAt":"2026-06-03T09:30:00.000Z","impressions":8500,"clicks":80,"ctr":0.94,"conversions":4}]'::jsonb,
   '2026-05-31 12:00','2026-06-03 09:30'),
  ('pj_05','cmp_buy','LinkedIn','Build a diversified pre-IPO portfolio with confidence.','scheduled','2026-06-02 13:00',NULL,NULL,NULL,'2026-05-31 12:00','2026-05-31 12:00'),
  ('pj_06','cmp_emp','LinkedIn','For early employees: liquidity options before the lock-up ends.','scheduled','2026-06-03 10:00',NULL,NULL,NULL,'2026-06-01 12:00','2026-06-01 12:00'),
  ('pj_07','cmp_sell','Email','A confidential, no-pressure valuation of your shares.','scheduled','2026-06-04 09:00',NULL,NULL,NULL,'2026-06-01 12:00','2026-06-01 12:00'),
  ('pj_08','cmp_buy','X','Secondary shares in late-stage leaders — now accessible.','approved','2026-06-05 11:00',NULL,NULL,NULL,'2026-06-01 12:00','2026-06-01 12:00'),
  ('pj_09','cmp_emp','Email','Thinking about liquidity before your IPO? Start here.','review','2026-06-06 09:00',NULL,NULL,NULL,'2026-06-02 12:00','2026-06-02 12:00'),
  ('pj_10','cmp_sell','LinkedIn','The founder''s guide to pre-IPO liquidity decisions.','scheduled','2026-06-07 10:30',NULL,NULL,NULL,'2026-06-02 12:00','2026-06-02 12:00'),
  ('pj_11','cmp_buy','Email','Family offices: curated access to pre-IPO names.','scheduled','2026-06-08 09:00',NULL,NULL,NULL,'2026-06-02 12:00','2026-06-02 12:00'),
  ('pj_12','cmp_emp','X','What your cap table won''t tell you about your equity''s worth.','draft','2026-06-09 14:00',NULL,NULL,NULL,'2026-06-02 12:00','2026-06-02 12:00'),
  ('pj_13','cmp_sell','X','Thinking about liquidity before your IPO? Start here.','scheduled','2026-06-10 09:30',NULL,NULL,NULL,'2026-06-02 12:00','2026-06-02 12:00'),
  ('pj_14','cmp_buy','LinkedIn','Family offices: curated access to pre-IPO names.','approved','2026-06-11 11:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_15','cmp_emp','LinkedIn','Your vested equity has options — here''s how to think about them.','scheduled','2026-06-12 10:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_16','cmp_sell','Email','What your cap table won''t tell you about your equity''s worth.','review','2026-06-14 09:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_17','cmp_buy','X','Secondary shares in late-stage leaders — now accessible.','scheduled','2026-06-15 13:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_18','cmp_emp','Email','For early employees: liquidity options before the lock-up ends.','draft','2026-06-16 09:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_19','cmp_sell','LinkedIn','Founders: understand your equity before the IPO window closes.','scheduled','2026-06-18 10:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_20','cmp_buy','LinkedIn','Build a diversified pre-IPO portfolio with confidence.','scheduled','2026-06-19 11:30',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_21','cmp_emp','X','Your vested equity has options — here''s how to think about them.','scheduled','2026-06-21 14:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_22','cmp_sell','X','Pre-IPO doesn''t have to mean pre-liquidity.','draft','2026-06-23 09:30',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_23','cmp_buy','Email','Accredited investors: vetted pre-IPO access, transparent pricing.','scheduled','2026-06-25 09:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00'),
  ('pj_24','cmp_emp','LinkedIn','For early employees: liquidity options before the lock-up ends.','approved','2026-06-28 10:00',NULL,NULL,NULL,'2026-06-03 12:00','2026-06-03 12:00');

-- ===========================================================================
-- Ads
-- ===========================================================================
INSERT INTO "AdCampaign"
  ("id","campaignId","name","platform","budget","spend","impressions","clicks","conversions","status","startDate","endDate","createdAt","updatedAt")
VALUES
  ('ad_01','cmp_sell','Sell-side Founder Liquidity — LinkedIn','LinkedIn',8000,5200,62000,1240,58,'active', now() - interval '29 days', now() + interval '10 days', now() - interval '29 days', now()),
  ('ad_02','cmp_sell','Sell-side Founder Liquidity — X','X',4000,2600,38000,420,12,'active', now() - interval '29 days', now() + interval '10 days', now() - interval '29 days', now()),
  ('ad_03','cmp_buy','Buy-side Investor Access — LinkedIn','LinkedIn',9000,6100,71000,1490,96,'active', now() - interval '23 days', now() + interval '14 days', now() - interval '23 days', now()),
  ('ad_04','cmp_emp','Employee Liquidity Education — LinkedIn','LinkedIn',5000,3100,48000,760,28,'active', now() - interval '17 days', now() + interval '20 days', now() - interval '17 days', now());

-- ===========================================================================
-- Agent runs (HISTORY — completed/skipped, not live). Powers the agent rail,
-- agent-runs page, agent health, and the marketing-insights view.
-- ===========================================================================
INSERT INTO "AgentRun"
  ("id","agentType","missionId","entityType","entityId","input","output","status","summary","startedAt","finishedAt","createdAt")
VALUES
  ('run_strategy','CampaignStrategyAgent','mis_sell','campaign','cmp_sell','{"objective":"Sell-side Founder Liquidity"}'::jsonb,
   '{"name":"Sell-side Founder Liquidity","audience":"Founders and early employees","channels":["LinkedIn","X","Email"]}'::jsonb,
   'completed','Drafted sell-side positioning and channel mix.', now() - interval '20 days', now() - interval '20 days', now() - interval '20 days'),
  ('run_content','ContentGenerationAgent','mis_sell','campaign','cmp_sell','{"campaignId":"cmp_sell","count":3,"platform":"LinkedIn"}'::jsonb,
   '{"created":3}'::jsonb,'completed','Generated 3 grounded LinkedIn drafts.', now() - interval '19 days', now() - interval '19 days', now() - interval '19 days'),
  ('run_compliance','ComplianceReviewAgent','mis_sell','post','post_04','{"postId":"post_04"}'::jsonb,
   '{"overallRisk":"low","approved":true,"flags":[]}'::jsonb,'completed','Compliance review passed (low risk).', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'),
  ('run_sim','SocialSimulationSwarmAgent','mis_sell','post','post_04','{"postId":"post_04"}'::jsonb,
   '{"overallScore":78,"verdict":"approve_with_edits"}'::jsonb,'completed','Swarm scored 78/100 — approve with edits.', now() - interval '2 days', now() - interval '2 days', now() - interval '2 days'),
  ('run_perf','PerformanceMonitoringAgent',NULL,'post','post_07','{"postId":"post_07"}'::jsonb,
   '{"verdict":"underperforming","expectedCtr":2.45,"ctr":1.82}'::jsonb,'completed','Underperforming: CTR 1.82% vs 2.45% expected — raised a rewrite suggestion.', now() - interval '1 day', now() - interval '1 day', now() - interval '1 day'),
  ('run_engagement','EngagementAgent',NULL,'post','post_06','{"postId":"post_06"}'::jsonb,
   '{"sentiment":"positive","themes":["pricing","access"],"counts":{"positive":3,"neutral":2}}'::jsonb,
   'completed','Audience positive; investors asking about access + pricing.', now() - interval '20 hours', now() - interval '20 hours', now() - interval '20 hours'),
  ('run_ads','AdsOptimizationAgent',NULL,'campaign','cmp_buy','{"campaignId":"cmp_buy"}'::jsonb,
   '{"bestChannel":"LinkedIn","budgetReallocation":[{"from":"X","to":"LinkedIn","amountPct":15}]}'::jsonb,
   'completed','Recommended shifting 15% budget to LinkedIn.', now() - interval '18 hours', now() - interval '18 hours', now() - interval '18 hours'),
  ('run_replication','ReplicationAgent',NULL,'post','post_01','{"postId":"post_01"}'::jsonb,
   '{"variants":2}'::jsonb,'completed','Spun 2 channel variants off a winning LinkedIn post.', now() - interval '14 hours', now() - interval '14 hours', now() - interval '14 hours'),
  ('run_viral','ViralOpportunityAgent',NULL,'post','post_09','{"postId":"post_09"}'::jsonb,
   '{"skipped":true,"reason":"no engagement spike (CTR at/below expected)"}'::jsonb,
   'skipped','Skipped — no engagement spike (CTR at/below expected).', now() - interval '12 hours', now() - interval '12 hours', now() - interval '12 hours'),
  ('run_memory','MemoryRetrievalAgent',NULL,NULL,NULL,'{"query":"what is working for buy-side"}'::jsonb,
   '{"hits":4}'::jsonb,'completed','Resurfaced 4 relevant memory chunks.', now() - interval '10 hours', now() - interval '10 hours', now() - interval '10 hours'),
  ('run_chat','ChatAgent',NULL,NULL,NULL,'{"message":"Why is the buy-side campaign underperforming?"}'::jsonb,
   '{"answer":"Buy-side LinkedIn converts below baseline; the right investor profiles aren''t engaging there."}'::jsonb,
   'completed','Answered a co-pilot question grounded in campaign data.', now() - interval '6 hours', now() - interval '6 hours', now() - interval '6 hours'),
  ('run_insights','MarketingPerformanceAnalyzerAgent',NULL,NULL,NULL,'{}'::jsonb,
   '{"baselines":{"ctr":2.28,"convRate":11.5,"qual":0.78},"working":[{"segment":"buy-side","channel":"Email","headline":"Email converts buy-side prospects well","detail":"3.11% link-to-lead vs 2.28% baseline; the right investor profiles are engaging. Double down on email nurture."}],"notWorking":[{"segment":"buy-side","channel":"LinkedIn","headline":"LinkedIn underperforming with buy-side prospects","detail":"Decent reach but low qualified engagement — the right investors aren''t commenting. Rework messaging."},{"segment":"employee","channel":"Email","headline":"Email underperforming with employees","detail":"0.78x blended effectiveness — weak conversion."}],"filtered":[{"label":"employee · X","reason":"inconsistent (CV 0.99 — outlier-driven)"}],"noiseUnits":2,"summary":"1 working, 2 underperforming across buy-side/sell-side; filtered 1 noise group + 2 thin units."}'::jsonb,
   'completed','1 working, 2 underperforming across segments; wrote 3 learnings to memory.', now() - interval '3 hours', now() - interval '3 hours', now() - interval '3 hours');

-- Agent steps (timelines for the key runs)
INSERT INTO "AgentStep" ("id","agentRunId","order","type","label","detail","createdAt") VALUES
  ('st_perf_1','run_perf',0,'thought','24h since posted · 33,000 impressions · 30 conv',NULL, now() - interval '1 day'),
  ('st_perf_2','run_perf',1,'thought','CTR 1.82% vs goal 2.45% · peers median 2.20% → underperforming',NULL, now() - interval '1 day'),
  ('st_perf_3','run_perf',2,'recommendation','Rewrite the CTA around investor access','["Sharper CTA","Test investor-specific hook","Shift budget to email"]'::jsonb, now() - interval '1 day'),
  ('st_perf_4','run_perf',3,'approval','Requesting approval to publish the improved variant',NULL, now() - interval '1 day'),
  ('st_eng_1','run_engagement',0,'thought','Pulled 5 audience comments — sentiment skews positive',NULL, now() - interval '20 hours'),
  ('st_eng_2','run_engagement',1,'thought','Qualified engagement: 2 investor profiles on-segment',NULL, now() - interval '20 hours'),
  ('st_eng_3','run_engagement',2,'output','Drafted 3 reply options for the human to send',NULL, now() - interval '20 hours'),
  ('st_ins_1','run_insights',0,'thought','Measured 28 units (posts + ads). Set aside 2 as too small to trust.',NULL, now() - interval '3 hours'),
  ('st_ins_2','run_insights',1,'thought','Baselines — reach 2.28% CTR · conversion 11.5% · fit-engagement 0.78/unit.',NULL, now() - interval '3 hours'),
  ('st_ins_3','run_insights',2,'thought','SIGNAL (working) — buy-side · Email: 1.38x effectiveness. Driver: conversion.',NULL, now() - interval '3 hours'),
  ('st_ins_4','run_insights',3,'thought','NOISE — employee · X: inconsistent (CV 0.99 — outlier-driven).',NULL, now() - interval '3 hours'),
  ('st_ins_5','run_insights',4,'memory','Wrote 3 confirmed learnings to the memory bank.',NULL, now() - interval '3 hours'),
  ('st_comp_1','run_compliance',0,'thought','Scanning copy for restricted claims',NULL, now() - interval '2 days'),
  ('st_comp_2','run_compliance',1,'output','No flags — low risk, approved',NULL, now() - interval '2 days'),
  ('st_sim_1','run_sim',0,'thought','6 personas reacting to the draft',NULL, now() - interval '2 days'),
  ('st_sim_2','run_sim',1,'output','Blended score 78/100 — approve with edits',NULL, now() - interval '2 days');

-- Agent reflections (powers Learning page + agent health scores)
INSERT INTO "AgentReflection" ("id","agentRunId","agentType","whatWorked","whatFailed","improvement","reflection","score","createdAt") VALUES
  ('rf_perf','run_perf','PerformanceMonitoringAgent','Grounded the diagnosis in peer + goal benchmarks','CTA rewrite was generic','Name the investor liquidity decision directly','Comparative benchmarking made the verdict credible.',0.82, now() - interval '1 day'),
  ('rf_eng','run_engagement','EngagementAgent','Weighted engagement by who actually fits the segment','Missed one objection theme','Track recurring objections over time','Fit-weighting surfaced that the right investors engaged.',0.86, now() - interval '20 hours'),
  ('rf_ads','run_ads','AdsOptimizationAgent','Clear reallocation backed by CPA','Did not test creative variants','Pair budget shifts with creative tests',  'Budget moved toward the higher-converting channel.',0.79, now() - interval '18 hours'),
  ('rf_content','run_content','ContentGenerationAgent','Used brand voice + prior human picks','Hooks felt similar across drafts','Vary the opening hook more','Drafts were on-brand and compliance-safe.',0.81, now() - interval '19 days'),
  ('rf_compliance','run_compliance','ComplianceReviewAgent','Caught no false positives','—','Keep the restricted-phrase list current','Clean low-risk pass.',0.9, now() - interval '2 days'),
  ('rf_sim','run_sim','SocialSimulationSwarmAgent','Diverse persona perspectives','One persona was redundant','Trim overlapping personas','Pre-flight catch of a weak CTA before publishing.',0.77, now() - interval '2 days'),
  ('rf_strategy','run_strategy','CampaignStrategyAgent','Anchored on past campaign performance','—','Quantify channel expectations','Positioning aligned to sell-side pain points.',0.8, now() - interval '20 days'),
  ('rf_insights','run_insights','MarketingPerformanceAnalyzerAgent','Separated signal from noise with sample + consistency gates','Ad sample too small to call','Backfill more ad rows per segment','Only confirmed, well-sampled patterns were written to memory.',0.88, now() - interval '3 hours');

-- ===========================================================================
-- Recommendations (open) — dashboard + per post/campaign
-- ===========================================================================
INSERT INTO "Recommendation" ("id","agentRunId","campaignId","postId","agentType","title","body","severity","actions","status","createdAt","updatedAt") VALUES
  ('rec_perf','run_perf','cmp_buy','post_07','PerformanceMonitoringAgent','Underperforming on LinkedIn (CTR below peers + goal)','After 24h this post has a 1.82% CTR vs a 2.45% expected. Likely cause: the CTA is not investor-specific.','warning','["Rewrite the CTA around investor access","Test a founder-vs-investor hook","Reallocate impressions"]'::jsonb,'open', now() - interval '1 day', now()),
  ('rec_ads','run_ads','cmp_buy',NULL,'AdsOptimizationAgent','Shift 15% ad budget to LinkedIn','LinkedIn is the best-converting channel for buy-side; X is lagging on CPA.','opportunity','["Move 15% budget X → LinkedIn","Pause lowest-CPA creative"]'::jsonb,'open', now() - interval '18 hours', now()),
  ('rec_health',NULL,'cmp_buy',NULL,'PerformanceMonitoringAgent','Campaign at risk vs goal','Buy-side is at 62% of its goal pace; conversion is healthy but reach on LinkedIn lags.','warning','["Increase LinkedIn reach","Double down on email nurture"]'::jsonb,'open', now() - interval '12 hours', now()),
  ('rec_viral','run_replication','cmp_sell','post_01','ReplicationAgent','Replicate the winning founder post','Post is 1.4x expected CTR — worth repurposing across channels.','opportunity','["Repurpose to X + Email","Boost with ad spend"]'::jsonb,'open', now() - interval '14 hours', now());

-- ===========================================================================
-- Approvals (pending) — the human-in-the-loop queue
-- ===========================================================================
INSERT INTO "ApprovalRequest" ("id","agentRunId","type","entityType","entityId","title","proposedAction","status","createdAt","updatedAt") VALUES
  ('apr_pub_04','run_sim','publish_post','post','post_04','Publish Email post (sell-side)','{"copy":"A confidential, no-pressure valuation of your founder shares."}'::jsonb,'pending', now() - interval '2 days', now()),
  ('apr_pub_07','run_perf','publish_post','post','post_07','Publish improved variant for LinkedIn post','{"copy":"Investors: build a diversified pre-IPO portfolio with transparent pricing.","reason":"CTA not investor-specific"}'::jsonb,'pending', now() - interval '1 day', now()),
  ('apr_budget','run_ads','budget_change','campaign','cmp_buy','Increase budget 20% to scale buy-side LinkedIn','{"newBudget":24000,"deltaPct":20}'::jsonb,'pending', now() - interval '18 hours', now());

-- ===========================================================================
-- Learning examples (human decisions the agents learn from)
-- ===========================================================================
INSERT INTO "LearningExample" ("id","agentRunId","agentType","context","originalOutput","editedOutput","reason","approvalStatus","campaignId","postId","createdAt") VALUES
  ('le_1','run_perf','PerformanceMonitoringAgent','Post copy suggestion (Sharper CTA)','See your options today','Understand your liquidity options before the IPO window closes','More specific to the founder decision','approved','cmp_sell','post_01', now() - interval '1 day'),
  ('le_2','run_content','ContentGenerationAgent','Post copy suggestion (Variant 1)','Pre-IPO liquidity, simplified.','Your equity, before the IPO. A confident, transparent path to liquidity.','Stronger brand voice','approved','cmp_sell','post_03', now() - interval '18 days'),
  ('le_3','run_engagement','EngagementAgent','Reply option','Thanks for the comment!','Great question — pricing is transparent and there''s no obligation. Want a quick walkthrough?','Rejected the generic reply','rejected','cmp_buy','post_06', now() - interval '19 hours');

-- ===========================================================================
-- Post comments + agent suggestions (the collaborative doc on post_05)
-- ===========================================================================
INSERT INTO "PostComment" ("id","postId","authorKind","author","type","body","quotedText","rangeStart","rangeEnd","options","status","agentRunId","createdAt","updatedAt") VALUES
  ('pc_1','post_05','agent','PerformanceMonitoringAgent','comment','This hook is strong but the value prop is implicit — consider naming the liquidity decision directly.','understand your options',18,41,NULL,'open',NULL, now() - interval '20 hours', now()),
  ('pc_2','post_05','agent','PerformanceMonitoringAgent','suggestion','Pick a rewrite to lift click-through — I''ll apply your choice.','What if you could understand your options before the lock-up ends?',NULL,NULL,
   '[{"id":"cta","label":"Sharper CTA","text":"Before your lock-up ends, understand exactly what your equity is worth — confidentially, with no obligation."},{"id":"v1","label":"Variant 1","text":"Founders: the window before your IPO is when the real decisions get made. See your liquidity options today."},{"id":"v2","label":"Variant 2","text":"Your equity is worth more than a number on a cap table. Understand your pre-IPO options now."}]'::jsonb,
   'open',NULL, now() - interval '20 hours', now()),
  ('pc_3','post_05','human','You','comment','Agree — let''s make the CTA founder-specific.',NULL,NULL,NULL,NULL,'open',NULL, now() - interval '18 hours', now());

-- ===========================================================================
-- Audience comments (with prospect personas → drives fit-weighted engagement)
-- ===========================================================================
INSERT INTO "AudienceComment" ("id","postId","author","text","sentiment","theme","status","reply","createdAt") VALUES
  ('au_1','post_01','@founder_jane','This is exactly what founders need before an IPO.','positive','value','open',NULL, now() - interval '5 days'),
  ('au_2','post_01','@stripe_earlyemp','Do you support secondary sales for employees too?','neutral','eligibility','replied','Yes — vested employees can explore liquidity options too.', now() - interval '5 days'),
  ('au_3','post_01','@liquidity_curious','Sounds a bit too good to be true tbh.','negative','trust','open',NULL, now() - interval '4 days'),
  ('au_4','post_06','@vc_mike','How does the pricing actually work for buyers?','neutral','pricing','open',NULL, now() - interval '4 days'),
  ('au_5','post_06','@familyoffice_kr','Finally a clear way to access pre-IPO names.','positive','access','open',NULL, now() - interval '4 days'),
  ('au_6','post_06','@accredited_amy','What''s the minimum to get started?','neutral','pricing','replied','Minimums vary by deal — happy to share specifics.', now() - interval '3 days'),
  ('au_7','post_09','@earlyemp_sara','My vesting cliff is coming up — this is timely.','positive','value','open',NULL, now() - interval '3 days'),
  ('au_8','post_09','@cap_table_nerd','How is any of this compliant?','negative','compliance','open',NULL, now() - interval '3 days');

-- ===========================================================================
-- Memory bank — FileAsset (documents) + MemoryChunk (chunks/learnings)
-- Uniform placeholder embedding so the Memory app, timeline AND search work.
-- ===========================================================================
INSERT INTO "FileAsset" ("id","fileName","mimeType","sizeBytes","url","text","tags","status","importance","locked","createdAt","updatedAt") VALUES
  ('file_brand','brand-voice.md','text/markdown',640,'https://storage.googleapis.com/neb-staging-uploads/brand-voice.md',
   '# Hiive brand voice

Confident, clear, and compliance-aware. Lead with the customer''s decision, never hype. No guarantees, no pressure — transparency over salesiness.', ARRAY['brand_guideline'],'ready',0.95,true, now() - interval '28 days', now()),
  ('file_sell','sell-side-messaging.md','text/markdown',720,'https://storage.googleapis.com/neb-staging-uploads/sell-side-messaging.md',
   '# Sell-side messaging

Speak to founders and early employees about the liquidity decision before an IPO. Emphasize understanding options, confidentiality, and no obligation.', ARRAY['sell_side_messaging','playbook'],'ready',0.8,false, now() - interval '26 days', now()),
  ('file_persona','buyer-persona.md','text/markdown',680,'https://storage.googleapis.com/neb-staging-uploads/buyer-persona.md',
   '# Buy-side persona

Accredited investors, venture funds, family offices and hedge funds seeking pre-IPO access. They care about vetted names, transparent pricing, and allocation.', ARRAY['buyer_persona'],'ready',0.75,false, now() - interval '24 days', now()),
  ('file_compliance','compliance-rules.md','text/markdown',900,'https://storage.googleapis.com/neb-staging-uploads/compliance-rules.md',
   '# Compliance rules

Avoid: "guaranteed", "risk-free", "best price". Prefer factual, transparent language. All claims must be substantiable.', ARRAY['compliance'],'ready',0.9,true, now() - interval '22 days', now());

INSERT INTO "MemoryChunk" ("id","fileId","content","embedding","memoryType","tags","tokenCount","chunkIndex","importance","locked","supersededCount","metadata","createdAt") VALUES
  ('mc_brand','file_brand','Hiive brand voice: confident, clear, compliance-aware. Lead with the customer''s decision, never hype. No guarantees, no pressure.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'semantic',ARRAY['brand_guideline'],32,0,0.95,true,0,'{}'::jsonb, now() - interval '28 days'),
  ('mc_sell','file_sell','Sell-side messaging: speak to founders and early employees about the liquidity decision before an IPO. Emphasize options, confidentiality, no obligation.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'procedural',ARRAY['sell_side_messaging','playbook'],34,0,0.8,false,0,'{}'::jsonb, now() - interval '26 days'),
  ('mc_persona','file_persona','Buy-side persona: accredited investors, venture funds, family offices, hedge funds seeking vetted pre-IPO access with transparent pricing.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'semantic',ARRAY['buyer_persona'],30,0,0.75,false,0,'{}'::jsonb, now() - interval '24 days'),
  ('mc_compliance','file_compliance','Compliance: avoid "guaranteed", "risk-free", "best price". Prefer factual, transparent, substantiable claims.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'semantic',ARRAY['compliance'],26,0,0.9,true,0,'{}'::jsonb, now() - interval '22 days'),
  ('mc_ins_buy_email',NULL,'Marketing learning (what works) for buy-side prospects on Email: Email converts buy-side prospects well — 3.11% link-to-lead vs 2.28% baseline, and the right investor profiles are engaging. Double down on email nurture.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'episodic',ARRAY['marketing_insight','what_works','past_performance','segment:buy-side','channel:Email'],48,0,0.86,false,0,'{"segment":"buy-side","channel":"Email","kind":"working"}'::jsonb, now() - interval '3 hours'),
  ('mc_ins_buy_li',NULL,'Marketing learning (what doesn''t) for buy-side prospects on LinkedIn: decent reach but low qualified engagement — the right investors aren''t commenting. Rework messaging or shift spend.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'episodic',ARRAY['marketing_insight','what_fails','past_performance','segment:buy-side','channel:LinkedIn'],44,0,0.78,false,0,'{"segment":"buy-side","channel":"LinkedIn","kind":"not_working"}'::jsonb, now() - interval '3 hours'),
  ('mc_ins_emp_email',NULL,'Marketing learning (what doesn''t) for employee prospects on Email: 0.78x blended effectiveness — weak conversion. Revisit the offer and CTA.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'episodic',ARRAY['marketing_insight','what_fails','past_performance','segment:employee','channel:Email'],36,0,0.72,false,0,'{"segment":"employee","channel":"Email","kind":"not_working"}'::jsonb, now() - interval '3 hours'),
  ('mc_human',NULL,'Human chose a sharper CTA on a sell-side LinkedIn post; preferred: "Understand your liquidity options before the IPO window closes." Original was generic.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'episodic',ARRAY['human_feedback','past_decisions'],38,0,0.6,false,1,'{"postId":"post_01","decision":"chose"}'::jsonb, now() - interval '1 day'),
  ('mc_playbook',NULL,'Playbook: buy-side converts best via email nurture; sell-side founders respond to LinkedIn thought-leadership. Lead with the decision, keep claims factual.',('[' || array_to_string(array_fill(0.03::float4, ARRAY[1536]), ',') || ']')::vector,'procedural',ARRAY['playbook','marketing_playbook'],36,0,0.7,false,0,'{}'::jsonb, now() - interval '2 days');

-- ===========================================================================
-- Knowledge graph (entities + relationships) — powers the graph tool/view
-- ===========================================================================
INSERT INTO "KnowledgeNode" ("id","type","refId","label","createdAt") VALUES
  ('kn_cmp_sell','campaign','cmp_sell','Sell-side Founder Liquidity', now() - interval '20 days'),
  ('kn_cmp_buy','campaign','cmp_buy','Buy-side Investor Access', now() - interval '20 days'),
  ('kn_post_01','post','post_01','Founders: understand what your equity…', now() - interval '8 days'),
  ('kn_post_06','post','post_06','Accredited investors: access vetted…', now() - interval '7 days'),
  ('kn_ad_03','ad','ad_03','Buy-side Investor Access — LinkedIn', now() - interval '23 days'),
  ('kn_mem_playbook','memory','mc_playbook','Playbook: buy-side email, sell-side LinkedIn', now() - interval '2 days');

INSERT INTO "KnowledgeEdge" ("id","fromId","toId","relation","createdAt") VALUES
  ('ke_1','kn_cmp_sell','kn_post_01','CAMPAIGN_CREATED_POST', now() - interval '8 days'),
  ('ke_2','kn_cmp_buy','kn_post_06','CAMPAIGN_CREATED_POST', now() - interval '7 days'),
  ('ke_3','kn_ad_03','kn_post_06','AD_PROMOTED_POST', now() - interval '7 days'),
  ('ke_4','kn_post_01','kn_mem_playbook','POST_USED_MEMORY', now() - interval '2 days'),
  ('ke_5','kn_post_06','kn_mem_playbook','POST_USED_MEMORY', now() - interval '2 days');

COMMIT;

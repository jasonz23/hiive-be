import { MockPurpose } from './llm.types';

/**
 * JSON shapes each agent parses. Injected into the OpenAI system prompt (in JSON
 * mode) so real GPT returns the exact keys the agents expect — the same shapes
 * the deterministic MockProvider produces.
 */
export const PURPOSE_SCHEMAS: Record<MockPurpose, string> = {
  planner:
    '{ "rationale": string, "steps": [{ "order": number, "agent": string, "action": string, "requiresApproval": boolean }] }',
  content_generation:
    '{ "posts": [{ "platform": string, "copy": string, "hook": string, "cta": string, "rationale": string }] }',
  compliance_review:
    '{ "overallRisk": "low"|"medium"|"high", "approved": boolean, "flags": [{ "phrase": string, "issue": string, "suggestion": string, "severity": "warning"|"critical" }], "summary": string }',
  social_simulation:
    '{ "overallScore": number, "personas": [{ "persona": string, "score": number, "reaction": string, "strengths": string[], "risks": string[] }], "strengths": string[], "risks": string[], "suggestedRevision": string, "verdict": "approve_with_edits"|"revise" }',
  performance_analysis:
    '{ "severity": string, "issue": string, "likelyCause": string, "recommendedActions": string[], "rewrittenCta": string }',
  ads_analysis:
    '{ "bestChannel": string, "weakAds": [{ "reason": string, "action": string }], "budgetReallocation": [{ "from": string, "to": string, "amountPct": number, "reason": string }], "creativeTests": string[], "audienceRecommendations": string[] }',
  viral_opportunity:
    '{ "isSpike": boolean, "expectedCtr": number, "currentCtr": number, "headline": string, "recommendations": string[] }',
  replication:
    '{ "variants": [{ "channel": "LinkedIn"|"X"|"Email"|"Ad"|"Blog", "copy": string }] }',
  reflection:
    '{ "whatWorked": string, "whatFailed": string, "improvement": string, "reflection": string, "score": number }',
  campaign_summary:
    '{ "summary": string, "highlights": string[], "risks": string[], "nextActions": string[] }',
  engagement_summary:
    '{ "sentiment": "positive"|"negative"|"mixed", "summary": string, "themes": string[], "replies": [{ "label": string, "text": string }], "objection": string|null, "copySuggestion": string|null }',
  marketing_insights:
    '{ "summary": string, "insights": [{ "kind": "working"|"not_working", "segment": string, "channel": string, "headline": string, "detail": string }] }',
  pre_publish_feedback:
    '{ "alignment": "aligned"|"mixed"|"off", "summary": string, "strengths": string[], "risks": string[], "suggestions": string[] }',
  chat: '{ "answer": string }',
};

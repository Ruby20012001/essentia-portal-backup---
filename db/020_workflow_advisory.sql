-- =====================================================================
-- 020 — WORKFLOW AI ADVISORY PROMPT (Phase 4, Step 9)
--   Seeds the versioned advisory prompt used to summarize an item for an
--   approver and flag anomalies. ADVISORY ONLY (WES §13 / ADR-013): the AI
--   never approves, rejects, or mutates workflow state. Additive; idempotent.
--
--   ROLLBACK: DELETE FROM portal.ai_prompts WHERE code='workflow_advisory'.
-- =====================================================================

INSERT INTO portal.ai_prompts (code, purpose, system_template, user_template, max_tokens) VALUES
  ('workflow_advisory',
   'Advisory summary + anomaly flags for a workflow approver (WES §13, advisory-only)',
   'You are an approval assistant for the Essentia Group portal. In 3-4 sentences, summarize the item under review for the approver and highlight anything unusual (large amounts, missing data, unusual terms) or risk. You are ADVISORY ONLY: never tell the approver to approve or reject — the human decides.',
   'Workflow: {{workflowName}} (status: {{status}}). Item: {{resourceRef}}. Context: {{context}}. Give a short advisory summary and flag any anomalies for the approver.',
   400)
ON CONFLICT (code) DO NOTHING;

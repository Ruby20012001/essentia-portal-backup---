-- =====================================================================
-- 036 — REMOVE THE AI ADVISORY
--
--   Ruby, 2026-09-02: take the AI feature out of the running application.
--
--   What went with it (code side): lib/ai and its three providers,
--   lib/services/workflow-advisory.ts, the /api/workflows/[id]/advisory route,
--   the advisory panels on My Approvals and Workflow Detail, and the
--   @anthropic-ai/sdk dependency.
--
--   WHAT DID NOT GO, and why:
--
--   1. The deterministic SLA-risk model. It lived in the advisory file but was
--      never AI — the level is a pure function of the pending deadlines. It now
--      stands alone in lib/services/workflow-sla-risk.ts and still drives the
--      SLA badges on the workflow screens. Deleting it would have removed a
--      working feature nobody asked to lose.
--
--   2. portal.communication_spine.ai_draft / ai_model / ai_generated_at. The
--      names are misleading: nothing AI ever wrote to them. Weekly Pulse fills
--      ai_draft from buildPulseDraft(), a template, and stamps ai_model with
--      the literal 'template'. Dropping the columns would break Velocity Gate 8
--      (the Weekly Pulse and Welcome Letter drafting) to fix a naming problem.
--      Renaming them is a bigger change than this one and is not what was
--      asked; recorded here so the next reader is not misled by the names.
--
--   Additive + idempotent.
--   ROLLBACK: re-insert the two config rows and the 'ai' resource type; the
--             application code has to come back from git.
-- =====================================================================

-- The provider/model selection has nothing left to configure.
DELETE FROM portal.app_config WHERE key IN ('ai.provider', 'ai.model');

-- The permission rows and the resource type they point at. Order matters:
-- public.permissions.resource_type is a FK to public.resource_types.
DELETE FROM public.permissions WHERE resource_type = 'ai';
DELETE FROM public.resource_types WHERE code = 'ai';

-- 'ai_access' was an action in the RBAC vocabulary, granted across resources by
-- the L0/L1 generated matrix. With no AI resource to act on it grants nothing,
-- and leaving it would keep offering a permission the app cannot honour.
DELETE FROM public.permissions WHERE action_code = 'ai_access';
DELETE FROM public.permission_actions WHERE code = 'ai_access';

-- ---------------------------------------------------------------------
-- Proof. A leftover row here is not cosmetic: a permission referencing a
-- resource type that no longer exists is a dangling grant, and a config key
-- nothing reads is a lie about what the system does.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  n_config  INTEGER;
  n_perms   INTEGER;
  n_actions INTEGER;
BEGIN
  SELECT COUNT(*) INTO n_config FROM portal.app_config
   WHERE key IN ('ai.provider', 'ai.model');
  SELECT COUNT(*) INTO n_perms FROM public.permissions
   WHERE resource_type = 'ai' OR action_code = 'ai_access';
  SELECT COUNT(*) INTO n_actions FROM public.permission_actions WHERE code = 'ai_access';

  IF n_config <> 0 OR n_perms <> 0 OR n_actions <> 0 THEN
    RAISE EXCEPTION
      'AI removal incomplete: % config rows, % permission rows, % actions remain.',
      n_config, n_perms, n_actions;
  END IF;
END $$;

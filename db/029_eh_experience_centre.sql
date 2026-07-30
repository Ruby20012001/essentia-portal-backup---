-- =====================================================================
-- 029 — EH · EXPERIENCE CENTRE + DISCOUNT CONTROL GATE
--        (Brief §28 · Velocity Gate 5 — S6, the last Phase-1 Core screen)
--
--   The gate: at an Experience Centre a Client Advisor may NOT communicate a
--   discount to a family until the Country Head has approved it. eh.sales
--   already carries the whole contract from db/001 —
--        discount_pct
--        discount_approved_by / discount_approved_at   (NULL = not approved)
--        discount_communicated_before_approval          (TRUE = logged violation)
--   so this migration adds no gate columns. It adds only what was missing to
--   run and configure the gate across all three centres:
--
--   1. eh.experience_centres.discount_threshold_pct — the point at which
--      approval becomes mandatory, per centre. CONFIGURATION-DRIVEN, not
--      hard-coded (ADR-EP-01, Monica's standing direction): the business
--      retunes a centre by UPDATE, never by a code change. DEFAULT 0 means
--      every discount needs sign-off, which is the safe default.
--
--   2. Indexes for the two hot reads — the month-to-date sales roll-up per
--      centre, and the pending-approval queue.
--
--   The violation flag is deliberately NOT constrained to FALSE. A CHECK would
--   make the violation unrecordable, and the portal's job here is to SURFACE
--   the breach, loudly and attributably, not to pretend it cannot happen
--   (ADR-HS-01, honest state).
--
--   Additive + idempotent. No engine, scheduler or notification changes.
--   ROLLBACK: ALTER TABLE eh.experience_centres DROP COLUMN discount_threshold_pct;
--             DROP INDEX eh.idx_eh_sales_ec_date, eh.idx_eh_sales_discount_pending;
-- =====================================================================

ALTER TABLE eh.experience_centres
  ADD COLUMN IF NOT EXISTS discount_threshold_pct DECIMAL(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN eh.experience_centres.discount_threshold_pct IS
  'Discount % at or above which Country Head approval is mandatory before the '
  'Client Advisor may communicate a price. 0 = every discount needs approval. '
  'Business-tunable per centre (ADR-EP-01) — never hard-code this in the app.';

-- ---------------------------------------------------------------------
-- RLS: the Country Head must see their own centre.
--   db/001 fences eh.sales to L0/L1 only. The Country Head — the screen's
--   OWN persona, the person who approves the discounts — is L2 and would
--   therefore read zero rows on their own dashboard. This is the same trap
--   db/001 already documents for families_project_team ("without this,
--   wio_clock's families join returns zero rows for the CRM TL — the
--   screen's own persona"), so it takes the same shape: scope by ownership,
--   not by level. A head sees their centre and no other.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS eh_sales_country_head ON eh.sales;
CREATE POLICY eh_sales_country_head ON eh.sales
  USING (
    EXISTS (
      SELECT 1 FROM eh.experience_centres ec
      WHERE ec.id = eh.sales.ec_id
        AND ec.country_head_id = current_setting('app.user_id', TRUE)::UUID
    )
  );

-- ---------------------------------------------------------------------
-- RLS: the head sees the families who bought at their centre.
--   Without this the gate reads "Unknown family" on every line, because
--   public.families is fenced to L0/L1 or the project team and a retail
--   buyer has no EE project. A Country Head approving a discount must be
--   able to see who it is for. Scoped to their own centre, nothing wider.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS families_eh_country_head ON public.families;
CREATE POLICY families_eh_country_head ON public.families
  USING (
    EXISTS (
      SELECT 1
        FROM eh.sales s
        JOIN eh.experience_centres ec ON ec.id = s.ec_id
       WHERE s.family_id = families.id
         AND ec.country_head_id = current_setting('app.user_id', TRUE)::UUID
    )
  );

-- ---------------------------------------------------------------------
-- PERMISSIONS: the gate's own actor must be able to work the gate.
--   L2 held read/create/edit on eh_sales but not approve, so the Country
--   Head could see the queue and not clear it — Velocity Gate 5 with no
--   way to pass it. Granted the same shape db/004 already uses for the TL
--   who owns a gate: communication_spine.approve ("TL reviews and sends")
--   and billing.financial_access, both TRUE at 'own_dept'.
--
--   This is deliberately NOT the pio.approve case, which db/004 denies at
--   L2 on purpose (§26 routes that chain through the workflow engine).
--   Here §28 names the Country Head as the approver, so the grant belongs
--   to them and the scope stays 'own_dept'.
-- ---------------------------------------------------------------------
INSERT INTO public.permissions (access_level, resource_type, action_code, allowed, scope, notes)
VALUES
  ('L2', 'eh_sales', 'approve', TRUE, 'own_dept',
   '§28 · Velocity Gate 5: the Country Head signs off a discount before any price reaches a family'),
  ('L2', 'eh_sales', 'financial_access', TRUE, 'own_dept',
   '§28: a Country Head sees revenue against target for the centre they hold')
ON CONFLICT (access_level, department_id, resource_type, action_code) DO NOTHING;

-- Month-to-date revenue and today's sales, per centre.
CREATE INDEX IF NOT EXISTS idx_eh_sales_ec_date
  ON eh.sales (ec_id, sale_date DESC);

-- The pending-approval queue: unapproved discounts, newest first.
CREATE INDEX IF NOT EXISTS idx_eh_sales_discount_pending
  ON eh.sales (ec_id, sale_date DESC)
  WHERE discount_approved_at IS NULL AND discount_pct > 0;

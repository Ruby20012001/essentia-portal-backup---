import { withUserContext } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";

/**
 * VisionCAM web view (Brief §35 · Velocity Gate 1) — the site-photo log and the
 * billing gate: a milestone that triggers on a VisionCAM photo cannot be
 * invoiced until the photo is captured (and QC-passed). READ-ONLY / monitor —
 * the capture itself is the offline-first mobile app. Row visibility is
 * RLS-scoped through the parent project; the billing gate additionally relies on
 * billing_milestones RLS (L0/L1), so the caller passes canSeeFinancials and the
 * UI hides amounts otherwise.
 */

export type VcPhoto = {
  id: string;
  capturedAt: string;
  capturedBy: string | null;
  gfcRef: string | null;
  qcStatus: string;
  designStageNo: number | null;
  billingTriggered: boolean;
  thumbnailUrl: string | null;
};

export type VcBillingGate = { name: string; amount: number; dueDate: string | null; overdueDays: number | null };

export type VisionCam = {
  project: { id: string; code: string; name: string | null };
  summary: { total: number; today: number; qcPass: number; qcPending: number; qcFail: number; blockedAmount: number };
  photos: VcPhoto[];
  billingGate: VcBillingGate[];
};

/** The visible project with the most recent capture, so the screen opens on data. */
export async function getLatestVisionCamProject(user: SessionUser): Promise<string | null> {
  return withUserContext(user, async (q) => {
    const [row] = await q<{ project_id: string }>(
      `SELECT p.project_id
       FROM ee.visioncam_photos p
       JOIN ee.projects pr ON pr.id = p.project_id AND pr.is_active
       ORDER BY p.captured_at DESC
       LIMIT 1`,
    );
    return row?.project_id ?? null;
  });
}

export async function getVisionCam(user: SessionUser, projectId: string): Promise<VisionCam | null> {
  return withUserContext(user, async (q) => {
    const [proj] = await q<{ id: string; project_code: string; project_name: string | null }>(
      `SELECT id, project_code, project_name FROM ee.projects WHERE id = $1 AND is_active`,
      [projectId],
    );
    if (!proj) return null;

    const photoRows = await q<{
      id: string;
      captured_at: string;
      captured_by: string | null;
      gfc_drawing_ref: string | null;
      qc_status: string;
      design_stage_no: number | null;
      billing_triggered: boolean;
      thumbnail_url: string | null;
    }>(
      `SELECT p.id, p.captured_at::text, u.full_name AS captured_by, p.gfc_drawing_ref,
              p.qc_status, p.design_stage_no, p.billing_triggered, p.thumbnail_url
       FROM ee.visioncam_photos p
       LEFT JOIN public.users u ON u.id = p.captured_by
       WHERE p.project_id = $1
       ORDER BY p.captured_at DESC
       LIMIT 60`,
      [projectId],
    );

    // billing_milestones is RLS-fenced to L0/L1 — this returns [] for others.
    const gateRows = await q<{ milestone_name: string; amount: string; due_date: string | null; overdue_days: number | null }>(
      `SELECT milestone_name, amount, due_date::text AS due_date,
              CASE WHEN due_date IS NULL THEN NULL ELSE (CURRENT_DATE - due_date)::int END AS overdue_days
       FROM ee.billing_milestones
       WHERE project_id = $1 AND trigger_type = 'visioncam' AND NOT invoice_raised
       ORDER BY due_date NULLS LAST`,
      [projectId],
    );

    const photos: VcPhoto[] = photoRows.map((r) => ({
      id: r.id,
      capturedAt: r.captured_at,
      capturedBy: r.captured_by,
      gfcRef: r.gfc_drawing_ref,
      qcStatus: r.qc_status,
      designStageNo: r.design_stage_no,
      billingTriggered: r.billing_triggered,
      thumbnailUrl: r.thumbnail_url,
    }));

    const today = new Date().toISOString().slice(0, 10);
    const billingGate: VcBillingGate[] = gateRows.map((g) => ({
      name: g.milestone_name,
      amount: Number(g.amount),
      dueDate: g.due_date,
      overdueDays: g.overdue_days == null ? null : Number(g.overdue_days),
    }));

    return {
      project: { id: proj.id, code: proj.project_code, name: proj.project_name },
      summary: {
        total: photos.length,
        today: photos.filter((p) => p.capturedAt.slice(0, 10) === today).length,
        qcPass: photos.filter((p) => p.qcStatus === "pass").length,
        qcPending: photos.filter((p) => p.qcStatus === "pending").length,
        qcFail: photos.filter((p) => p.qcStatus === "fail").length,
        blockedAmount: billingGate.reduce((n, g) => n + g.amount, 0),
      },
      photos,
      billingGate,
    };
  });
}

import { query } from "@/lib/db";
import { getConfig } from "@/lib/services/config";
import { writeAudit } from "@/lib/services/audit";
import { requirePermission } from "@/lib/services/permissions";
import { getKekaProvider } from "@/lib/integrations/keka";
import type { SessionUser } from "@/lib/auth/session";
import type { SyncResult, SyncStats } from "@/lib/integrations/keka/types";

/**
 * Keka org sync. After a run: employees, reporting hierarchy, designations,
 * and active status come from Keka; departments are MAPPED onto the Master
 * (config keka.department_mapping) and never created outside it. The run
 * also resolves the PIO approval chain by linking seeded approver emails to
 * the freshly-synced accounts.
 *
 * Runs on plain query() (not withUserContext): it's an admin write over
 * non-RLS tables (public.users/departments, portal.*), gated at the API by
 * requirePermission(hr_access, users) → L0/L1 only.
 */
export async function runKekaSync(
  user: SessionUser,
  triggerType: "manual" | "scheduled",
): Promise<SyncResult> {
  await requirePermission(user, "hr_access", "users");

  const providerName = await getConfig<string>("keka.provider", "fixture");
  const [run] = await query<{ id: string }>(
    `INSERT INTO portal.sync_runs (source, provider, trigger_type, started_by)
     VALUES ('keka', $1, $2, $3) RETURNING id`,
    [providerName, triggerType, user.id],
  );
  const runId = run.id;

  const stats: SyncStats = {
    employeesCreated: 0,
    employeesUpdated: 0,
    employeesDeactivated: 0,
    departmentsMatched: 0,
    unmappedDepartments: [],
    reportsResolved: 0,
    approversResolved: 0,
  };

  try {
    const provider = await getKekaProvider();
    const mapping = await getConfig<Record<string, string>>(
      "keka.department_mapping",
      {},
    );
    const employees = await provider.fetchEmployees();

    // Resolve Master department ids once (Keka name → code → id).
    const codeToId = new Map<string, string>();
    const matchedNames = new Set<string>();
    const unmapped = new Set<string>();
    for (const emp of employees) {
      if (!emp.departmentName) continue;
      const code = mapping[emp.departmentName];
      if (!code) {
        unmapped.add(emp.departmentName);
        continue;
      }
      if (!codeToId.has(code)) {
        const [dept] = await query<{ id: string }>(
          `SELECT id FROM public.departments WHERE code = $1`,
          [code],
        );
        // Mapped to a code that isn't in the Master → treat as unmapped.
        if (!dept) {
          unmapped.add(emp.departmentName);
          continue;
        }
        codeToId.set(code, dept.id);
      }
      matchedNames.add(emp.departmentName);
    }
    stats.departmentsMatched = matchedNames.size;
    stats.unmappedDepartments = [...unmapped];

    // Pass 1 — upsert people. access_level is set on INSERT only (from the
    // Keka hint); on UPDATE we keep any in-portal elevation. is_active,
    // designation, department, and keka_employee_id always track Keka.
    for (const emp of employees) {
      const deptCode = emp.departmentName
        ? mapping[emp.departmentName]
        : undefined;
      const deptId = deptCode ? (codeToId.get(deptCode) ?? null) : null;

      const [existing] = await query<{ id: string; is_active: boolean }>(
        `SELECT id, is_active FROM public.users WHERE lower(email) = lower($1)`,
        [emp.email],
      );

      if (!existing) {
        await query(
          `INSERT INTO public.users
             (email, full_name, display_name, job_title, department_id,
              access_level, is_active, keka_employee_id, auth_provider)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'entra')`,
          [
            emp.email,
            emp.fullName,
            emp.displayName,
            emp.designation,
            deptId,
            emp.accessLevelHint ?? "L3",
            emp.active,
            emp.kekaId,
          ],
        );
        stats.employeesCreated += 1;
      } else {
        await query(
          `UPDATE public.users
           SET full_name = $2, display_name = $3, job_title = $4,
               department_id = $5, is_active = $6, keka_employee_id = $7,
               updated_at = NOW()
           WHERE id = $1`,
          [existing.id, emp.fullName, emp.displayName, emp.designation, deptId, emp.active, emp.kekaId],
        );
        stats.employeesUpdated += 1;
        if (existing.is_active && !emp.active) stats.employeesDeactivated += 1;
      }
    }

    // Pass 2 — reporting hierarchy (managerKekaId → reports_to).
    for (const emp of employees) {
      if (!emp.managerKekaId) continue;
      const rows = await query<{ id: string }>(
        `UPDATE public.users u
         SET reports_to = m.id
         FROM public.users m
         WHERE u.keka_employee_id = $1 AND m.keka_employee_id = $2
         RETURNING u.id`,
        [emp.kekaId, emp.managerKekaId],
      );
      if (rows.length > 0) stats.reportsResolved += 1;
    }

    // Pass 3 — arm workflow approver chains (A-04). Link seeded approver
    // emails to now-existing accounts.
    const approvers = await query<{ id: string }>(
      `UPDATE portal.workflow_steps s
       SET approver_user_id = u.id
       FROM public.users u
       WHERE s.approver_email IS NOT NULL
         AND lower(u.email) = lower(s.approver_email)
         AND u.is_active
         AND (s.approver_user_id IS DISTINCT FROM u.id)
       RETURNING s.id`,
    );
    stats.approversResolved = approvers.length;

    const status: SyncResult["status"] =
      stats.unmappedDepartments.length > 0 ? "partial" : "success";

    await query(
      `UPDATE portal.sync_runs
       SET status = $2, finished_at = NOW(), stats = $3::jsonb WHERE id = $1`,
      [runId, status, JSON.stringify(stats)],
    );
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "KEKA_SYNC",
      resourceType: "users",
      resourceId: runId,
      newValues: { provider: providerName, triggerType, status, ...stats },
    });

    return { runId, status, provider: providerName, stats };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await query(
      `UPDATE portal.sync_runs
       SET status = 'failed', finished_at = NOW(), error_msg = $2 WHERE id = $1`,
      [runId, message],
    );
    await writeAudit({
      userId: user.id,
      role: user.accessLevel,
      action: "KEKA_SYNC_FAILED",
      resourceType: "users",
      resourceId: runId,
      newValues: { provider: providerName, error: message },
    });
    throw error;
  }
}

export type SyncRunSummary = {
  id: string;
  provider: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  stats: SyncStats | null;
  errorMsg: string | null;
};

export async function getLatestSyncRuns(
  user: SessionUser,
  limit = 10,
): Promise<SyncRunSummary[]> {
  await requirePermission(user, "hr_access", "users");
  const rows = await query<{
    id: string;
    provider: string;
    trigger_type: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    stats: SyncStats | null;
    error_msg: string | null;
  }>(
    `SELECT id, provider, trigger_type, status, started_at::TEXT,
            finished_at::TEXT, stats, error_msg
     FROM portal.sync_runs ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    triggerType: r.trigger_type,
    status: r.status,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    stats: r.stats,
    errorMsg: r.error_msg,
  }));
}

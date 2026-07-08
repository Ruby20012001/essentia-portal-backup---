# RBAC & Authorization

Two enforcement layers, both always on:

1. **Permission engine** (`public.permissions`, resolved by
   `lib/services/permissions.ts`) governs **actions**.
2. **Postgres RLS** (via `withUserContext`) governs **row visibility**.

Neither substitutes for the other. Every decision is audited.

## Role hierarchy (approved by Monica, 2026-07-06)

| Level | Who | Baseline |
|---|---|---|
| **L0** | Founders (Hardesh, Monica) | Unrestricted, except the audit trail is read-only for everyone |
| **L1** | Senior leadership (Deepak Ji / COO, chiefs) | See everything; approvals per chain; founder brief read-only |
| **L2** | HODs / Team Leads | Own-department scope; owns the 15-day WIO window; **cannot** approve PIOs |
| **L3** | Team members | Narrow, own-dept; no financials; no Family Profile |

## The engine

- **12 actions**: read, create, edit, delete, approve, reject, assign,
  escalate, export, ai_access, financial_access, hr_access.
- **21 resource types** × levels × optional department → `permissions` rows
  with `allowed` + `scope` (`all` / `own_dept` / `own_records`).
- **Resolution**: deny-by-default; a department-specific row beats the level's
  global row. `requirePermission()` throws `PermissionError` (403).
- **Logging** per `rbac.audit_mode` config (`all` | `denials_and_sensitive` |
  `sensitive_only`) — writes `PERMISSION_ALLOW`/`PERMISSION_DENY` with role.
- **Changing policy is a row update**, never a deploy. Ruby's review of this
  matrix *is* the role-permission test matrix the brief (§38) says is missing.

## Permission matrix (representative — full rows in `db/004`)

| Resource | L0 | L1 | L2 | L3 |
|---|---|---|---|---|
| projects | CRUD+approve (all) | CRUD+approve (all) | CRE (own_dept) | R (own_dept) |
| families | full | R/W | R/W (own_dept, §5) | **denied** (§5) |
| wio | full | full | CRE+approve (own_dept) | R/create (own_dept) |
| pio | full | full | CRE, **approve denied** (§26) | R |
| billing / financial_access | full | full | R/edit (own_dept) | **denied** (§36) |
| visioncam | full | full | R/W | create (own_records) |
| eh_sales | full | full+approve | R/W (own_dept) | R/create |
| knowledge_library | full | full | R/create (all) | R (all) |
| users / hr_access | full | full | **hr_access denied** | no grant |
| audit_log | R only | R only | denied | denied |
| founder_brief | R/W | R only | denied | denied |
| ai / ai_access | full | full | own_dept | own_records |

## Resource access (RLS) matrix

| Level | Projects visible | Families visible |
|---|---|---|
| L0 / L1 | all active | all |
| L2 | where they are crmtl/pmc/designer | families of projects they serve |
| L3 | where they are crmtl/pmc/site_supervisor | none |

## Approval permissions (workflow engine)

Approvals are **not** an RBAC action alone — they run through the workflow
engine with **exact-approver identity**. The seeded PIO chain (§26):

```
Khushpreet Arora (Production Head) → Deepak Jain / Deepak Ji (COO) → Hardesh Chawla (CEO)
```

Each step names a specific person (resolved from `approver_email` at Keka
sync). Nobody else — regardless of level — can approve a step that isn't
theirs; an unresolved approver blocks the step and names the intended person.

## Global security rules (Monica's ruling #4 — enforced, cited)

| Rule | Enforcement |
|---|---|
| Family Profile never below HOD/TL | `permissions` deny row (§5) **+** RLS |
| Accounts/financial inaccessible to juniors | `permissions` deny rows (§36) |
| PIO approval Khushpreet→Deepak Ji→Hardesh | workflow chain; L2 `pio.approve` explicitly denied |
| Mumbai EC cannot generate Rimadesio quotes | config `eh.rimadesio.blocked_departments` (product×location rule, documented exception A-12) |

# API Catalogue

**32 routes**, all Next.js App Router handlers (`app/api/**/route.ts`),
`dynamic = "force-dynamic"`. JSON in/out. Every route resolves the session
via `getCurrentUser()` (401 if none) unless noted; mutating business routes
additionally call `requirePermission()` and/or RLS via `withUserContext`.

## Conventions

- **Auth**: session cookie (`essentia_session`, httpOnly). Middleware gates
  page/API access at the edge (cookie presence); handlers validate fully.
- **Request validation**: Zod on every body-bearing route; malformed UUID path
  params rejected 400 before SQL (`lib/api/params.ts`).
- **Response**: `200/201` `{ <resource> }`; errors `{ error: string }` (+
  `details` for validation).
- **Error mapping** (`lib/api/errors.ts`, single source): `PermissionError`→403,
  `AuthError`/`AuthProviderError`→401, `AccountLockedError`→423,
  `BlockingRuleError`→422, `ConflictError`/`WorkflowError`→409/4xx,
  `NotFoundError`→404, Zod→400, unknown→500.

## Auth & identity

| Method · Path | Gate | Purpose |
|---|---|---|
| `POST /api/auth/login` | public, throttled | Credential login (local provider) → session cookie |
| `POST /api/auth/logout` | session | Revoke current session, clear cookie |
| `GET /api/auth/session` | public | Current user or 401 |
| `GET /api/auth/sessions` | session | List my active sessions (devices) |
| `DELETE /api/auth/sessions/[id]` | session | Sign out one device |
| `GET /api/auth/entra/start` · `/callback` | public | Entra OIDC redirect (credential-gated) |
| `POST /api/auth/dev-login` | dev-only (404 in prod) | Bootstrap session by id/email |
| `GET /api/me` | session | Current user + unread count |

## WIO / PIO (S4)

| Method · Path | Gate | Purpose |
|---|---|---|
| `GET /api/wio` (`?view=history&q=`) | read wio | Clock feed / searchable history |
| `POST /api/wio` | create wio | Create WIO (FK-routed to Master) |
| `PATCH /api/wio/[id]` | edit wio | Checklist / status / notes |
| `POST /api/wio/[id]/convert` | create pio | §30 checklist gate → PIO |
| `GET /api/pio` | read pio | Factory clock + Triangle + approval state |
| `PATCH /api/pio/[id]` | edit pio | Triangle of Agreement toggles |
| `POST /api/pio/[id]/request-approval` | edit pio | §29 Triangle gate → approval chain |
| `POST /api/workflows/[id]/act` | step approver | Approve/reject a workflow step |
| `GET /api/projects` | read projects | RLS-scoped project picker |

## Platform

| Method · Path | Gate | Purpose |
|---|---|---|
| `GET /api/dashboard/crmtl` | session | S2 dashboard (RLS-scoped) |
| `GET /api/departments` (`?tree=1`) | read departments | Department Master / hierarchy |
| `GET /api/factory/stations` | read factory | Factory Master (7 active + 2 reserved) |
| `GET /api/audit` | read audit_log (L0/L1) | Audit trail read |
| `GET /api/notifications` (`?status=&category=&q=`) | session | Notification Center feed |
| `POST /api/notifications/[id]/read` · `/archive` · `/acknowledge` | session (own) | Item lifecycle |
| `POST /api/notifications/mark-all-read` | session | Bulk read |
| `GET·PUT /api/notifications/preferences` | session | Channels/quiet-hours/categories |
| `POST /api/integrations/keka/sync` | hr_access (L0/L1) | Manual org sync |
| `GET /api/integrations/keka/status` | hr_access | Recent sync runs |

## Jobs (scheduler-driven; auto-pilot cadence pending, A-14)

| Method · Path | Purpose |
|---|---|
| `POST /api/jobs/wio-clock` | §30 day-12/lapse escalation sweep (event-deduped) |
| `POST /api/jobs/keka-sync` | Scheduled org sync (honors `keka.sync_enabled`) |
| `POST /api/jobs/notifications/dispatch` | Delivery retry processor (backoff → dead-letter) |

## Versioning strategy (recommendation)

The API is currently **unversioned** (`/api/*`), appropriate for a single
first-party client. Before external/mobile (VisionCAM) consumers or partner
integrations, adopt a prefix scheme: keep the current surface as the implicit
`v1` and introduce `/api/v2/*` only on breaking contract changes, running both
during a deprecation window. Internal job routes stay unversioned. See
[TECH_DEBT.md](TECH_DEBT.md) TD-07.

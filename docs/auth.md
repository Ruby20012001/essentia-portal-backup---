# Authentication & Identity (Platform Phase 1)

For a developer joining later. Replaces the `DEV_USER_ID` env stub with real,
revocable, timeout-aware sessions. Production identity is Microsoft Entra ID;
a local password provider backs development and break-glass access.

## The model

- **Provider abstraction** ([lib/auth/providers/types.ts](../frontend/lib/auth/providers/types.ts)) — the app depends on `AuthProvider`, never a vendor. Active provider chosen by config `auth.provider`.
  - `entra` ([providers/entra.ts](../frontend/lib/auth/providers/entra.ts)) — production OIDC redirect flow; **fails loud** without `ENTRA_TENANT_ID/CLIENT_ID/CLIENT_SECRET` (never silently falls back to passwords). Token-signature validation lands with a real tenant (A-16).
  - `local` ([providers/local-password.ts](../frontend/lib/auth/providers/local-password.ts)) — real scrypt verification + lockout after repeated failures.
- **Sessions** ([lib/auth/sessions.ts](../frontend/lib/auth/sessions.ts)) — server-side, in `portal.sessions`. The cookie holds an opaque 256-bit token; only its SHA-256 is stored. Enforces absolute + idle timeout, a concurrent-session cap (oldest revoked), and device/IP tracking. Every lifecycle event is audited (`LOGIN`, `LOGOUT`, `SESSION_EXPIRE`, `SESSION_REVOKE`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`).
- **Resolution** ([lib/auth/session.ts](../frontend/lib/auth/session.ts)) — `getCurrentUser()` reads the cookie and validates server-side on every request; access level + department always come from `public.users`. The `(portal)` layout redirects to `/login` when unauthenticated.
- **Route gate** ([middleware.ts](../frontend/middleware.ts)) — Edge runtime, so cookie-presence only (no DB); full validation happens in `getCurrentUser()`. Permissive when `AUTH_ALLOW_DEV_LOGIN=true`.

## Config (portal.app_config, `auth.*`)

| Key | Default | Meaning |
|---|---|---|
| `auth.provider` | `local` | `entra` (prod) or `local` |
| `auth.session_absolute_minutes` | 480 | hard session lifetime |
| `auth.session_idle_minutes` | 60 | idle timeout |
| `auth.max_concurrent_sessions` | 3 | per-user active cap |
| `auth.lockout_threshold` / `auth.lockout_minutes` | 5 / 15 | failed-login lock |

## API

`POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/session` ·
`GET /api/auth/sessions` · `DELETE /api/auth/sessions/{id}` (sign out a device) ·
`GET /api/auth/entra/start` + `/callback` · `POST /api/auth/dev-login` (dev only, 404 in prod).

## Dev vs production

- **Dev** (`AUTH_ALLOW_DEV_LOGIN=true`): the `DEV_USER_ID` fallback and
  `/api/auth/dev-login` work; the gate is permissive. Password login also
  works (`dev.*@essentia.in` / `essentia-dev-2026`).
- **Production** (`AUTH_ALLOW_DEV_LOGIN` unset): the fallback and dev-login are
  dead; the portal depends entirely on real sessions. Set the Entra env and
  flip `auth.provider` to `entra`.

## Verify

```bash
cd db && npm run validate                 # incl. sessions/timeout predicate checks
cd frontend && npm run test
# Auth E2E — production mode (dev login OFF), HTTP-only:
cd db && DEV_DB_PORT=55433 npm run dev-db &
cd frontend && DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55433/postgres \
  PGPOOL_MAX=1 AUTH_ALLOW_DEV_LOGIN=false DEV_USER_ID= npx next dev -p 3100 &
E2E_BASE=http://localhost:3100 node frontend/tests/e2e/auth.e2e.mjs
```

## Known gaps

- **Entra token validation** (JWKS signature, nonce/PKCE, claims→user) is
  scaffolded but not implemented — needs a tenant to build and test against
  (A-16). The redirect plumbing and session minting around it are complete.
- **MFA** is architected (`users.mfa_enrolled/mfa_secret`) but not enforced.
- **Rate limiting** is in-memory (single instance); a multi-instance deploy
  needs a shared store — see the Phase 5 hardening notes.

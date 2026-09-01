# Microsoft sign-in — what to request from IT

The WIO team is on Microsoft 365, so staff sign in with their existing
`@essentia.in` accounts. No portal passwords are created, distributed or reset.

This page is the request to hand to whoever administers the essentia Microsoft
tenant. It needs no knowledge of the portal.

> **Status:** the portal's redirect to Microsoft is built; the **callback that
> completes sign-in is not yet implemented** (A-16 in
> `docs/ASSUMPTIONS_DECISIONS.md`). The registration below is required either
> way and can be done in parallel — but sign-in will not work until that code
> lands. Do not schedule the team's first day on the tracker against the
> registration alone.

---

## The request

> Please create an **app registration** in our Microsoft Entra ID tenant for an
> internal web application called **essentia portal**.
>
> **1. Registration**
> - Name: `essentia portal`
> - Supported account types: **accounts in this organizational directory only**
>   (single tenant). This is internal staff only — it must not accept personal
>   or other-tenant Microsoft accounts.
>
> **2. Redirect URI** — platform type **Web** (not SPA, not Public client):
>
> ```
> https://<the-portal-subdomain>/api/auth/entra/callback
> ```
>
> Add one per environment that will exist, e.g.:
> ```
> https://tracker.essentia.in/api/auth/entra/callback
> http://localhost:3000/api/auth/entra/callback     ← local development
> ```
> The path is exact and case-sensitive. Microsoft rejects any redirect not
> listed here, which is the point.
>
> **3. Permissions** — Microsoft Graph, **delegated**, and only:
> `openid`, `profile`, `email`
>
> Nothing more. The portal reads who signed in and no mailbox, calendar,
> file or directory data. Please do not grant application permissions.
>
> **4. Client secret** — create one and note its expiry date. Send it through
> whatever channel we use for secrets, **not** email or chat.
>
> **5. Send back:**
> | Item | Where it comes from |
> |---|---|
> | Directory (tenant) ID | app registration → Overview |
> | Application (client) ID | app registration → Overview |
> | Client secret **value** | Certificates & secrets (copy at creation — it is never shown again) |
> | Secret expiry date | so we can rotate before it lapses |
>
> **6. Who may sign in.** Access is controlled inside the portal, not by the
> registration — only the people we have provisioned can get in, and everyone
> else is refused even with a valid essentia Microsoft account. If you would
> rather also restrict it at the tenant, enable **assignment required** and
> assign only the WIO team.

---

## Then, in the portal's environment

```
ENTRA_TENANT_ID=<directory tenant id>
ENTRA_CLIENT_ID=<application client id>
ENTRA_CLIENT_SECRET=<secret value>
```

Provider selection lives in `portal.app_config → auth.provider`. The login page
shows "Sign in with Microsoft" whenever `ENTRA_TENANT_ID` is set.

> **Keep `AUTH_ALLOW_DEV_LOGIN` unset.** With it on, the portal acts as
> `DEV_USER_ID` with no sign-in at all, which would make the whole Entra setup
> decorative. See `docs/DEPLOYMENT.md`.

---

## Who can actually get in

The six WIO team accounts exist already (`db/035`), all
`auth_provider = 'entra'` with **no password**, so Microsoft is their only route
in:

| Person | Level | Role |
|---|---|---|
| Dipmalya Das | L2 | Team Lead — WIO department |
| Neeraj Jangra | L2 | Team Lead — WIO department |
| Vishal Kaushik | L2 | Team Lead — WIO department |
| Anshul Soni | L3 | Senior Draughtsman |
| Atul Yadav | L3 | Senior Draughtsman |
| Jyoti Yadav | L3 | Senior Draughtsman |

**A valid essentia Microsoft account is not enough.** Sign-in must match a
provisioned row in `public.users`; anyone else is refused. That is deliberate —
otherwise every employee in the tenant would reach a board carrying live client
names, project scopes and internal delay attribution.

Adding someone later is one row, not a code change. Removing someone is
`is_active = FALSE`.

---

## What still has to be built (A-16)

`lib/auth/providers/entra.ts` → `completeCallback()` currently throws. To
finish it:

1. **Exchange the code** at
   `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`.
2. **Validate the ID token** against the tenant JWKS — signature, `iss`, `aud`,
   `exp`, and a `nonce` bound to the login attempt. This is the security of the
   whole thing; it should not be hand-rolled or skipped.
3. **Add PKCE** to the authorization request.
4. **Map claims to a user** — match `oid` against `users.microsoft_oid`, else
   fall back to `lower(email)` and store the `oid` on first sign-in.
   **Never auto-create a user**: an unknown-but-valid Microsoft account must be
   refused, or the provisioning model above means nothing.

Steps 1–3 need the tenant values to be verified end to end. Step 4's logic can
be built and tested before the tenant exists.

import { LoginStage } from "@/components/auth/LoginStage";

export const dynamic = "force-dynamic";

/**
 * S1 · sign-in. Entra ID for staff (production); password for dev/break-glass.
 *
 * The page itself only reads the environment and hands the answers down. What
 * it looks like — the intro, the drawn plan, the greeting — is in LoginStage,
 * because all of that needs the browser: the reader's time of day, and whether
 * they have asked their system for less movement. Neither is knowable here.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string; email?: string };
}) {
  return (
    <LoginStage
      entraConfigured={Boolean(process.env.ENTRA_TENANT_ID)}
      devLogin={process.env.AUTH_ALLOW_DEV_LOGIN === "true"}
      next={searchParams.next}
      error={searchParams.error}
      email={searchParams.email}
    />
  );
}

import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/**
 * S1 · sign-in. Entra ID for staff (production); password for dev/break-glass.
 *
 * The background is a CSS background-image rather than <Image>, for one
 * practical reason: the file may not be there. A missing <Image> src renders a
 * broken-image box and logs an error; a missing background-image is simply
 * nothing, and the layers beneath carry the page on their own. So this looks
 * finished with no photograph at all, and better the moment someone drops one
 * in at public/brand/login.jpg — no code change, no deploy decision.
 *
 * Two layers sit over it. The wash keeps the card readable whatever the
 * photograph turns out to be — a bright render would otherwise swallow white
 * text — and the gradient settles the bottom edge so the footer line does not
 * fight a busy corner. Both are brand colours rather than plain black, so an
 * interior render reads warm rather than merely dimmed.
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const entraConfigured = Boolean(process.env.ENTRA_TENANT_ID);
  const devLogin = process.env.AUTH_ALLOW_DEV_LOGIN === "true";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-espresso px-6">
      <div
        aria-hidden
        className="absolute inset-0 scale-105 bg-[url('/brand/login.jpg')] bg-cover bg-center"
      />
      <div aria-hidden className="absolute inset-0 bg-espresso/75" />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-b from-espresso/40 via-transparent to-espresso"
      />

      <div className="relative w-full max-w-sm rounded-lg border border-cream/10 bg-card/85 px-8 py-10 shadow-2xl backdrop-blur-md">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/brand/logo-dark.png"
            alt="essentia"
            height={22}
            width={112}
            className="mb-4"
            priority
          />
          <p className="font-body text-xs font-light tracking-wide text-label">
            every client returns
          </p>
        </div>

        {searchParams.error ? (
          <p
            role="alert"
            className="mb-4 rounded border-l-4 border-alert bg-alert/5 px-3 py-2 font-body text-xs font-bold text-alert"
          >
            {searchParams.error}
          </p>
        ) : null}
        {/* One way in. Staff accounts carry no password (db/035, auth_provider
            'entra'), so offering the password form alongside would be a dead
            control: someone types their email, fails, and concludes the portal
            is broken. The form stays as the break-glass path for when Entra is
            not configured — a deployment with no tenant must still be
            reachable. */}
        {entraConfigured ? (
          <a
            href="/api/auth/entra/start"
            className="block rounded bg-navy px-5 py-2.5 text-center font-body text-sm font-bold text-cream transition-opacity hover:opacity-90"
          >
            Sign in with Microsoft
          </a>
        ) : (
          <LoginForm next={searchParams.next} showDevHint={devLogin} />
        )}
      </div>

      <p className="absolute bottom-6 font-body text-[10px] font-light tracking-[0.2em] text-cream/30">
        ESSENTIA GROUP
      </p>
    </div>
  );
}

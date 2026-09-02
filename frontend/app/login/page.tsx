import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/** S1 · sign-in. Entra ID for staff (production); password for dev/break-glass. */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const entraConfigured = Boolean(process.env.ENTRA_TENANT_ID);
  const devLogin = process.env.AUTH_ALLOW_DEV_LOGIN === "true";

  return (
    <div className="flex min-h-screen items-center justify-center bg-espresso px-6">
      <div className="w-full max-w-sm rounded-lg border border-line bg-card px-8 py-10">
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
        {entraConfigured ? (
          <a
            href="/api/auth/entra/start"
            className="mb-4 block rounded bg-navy px-5 py-2.5 text-center font-body text-sm font-bold text-cream transition-opacity hover:opacity-90"
          >
            Sign in with Microsoft
          </a>
        ) : null}

        <LoginForm next={searchParams.next} showDevHint={devLogin} />
      </div>
    </div>
  );
}

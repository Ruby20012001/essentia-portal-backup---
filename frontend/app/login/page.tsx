import Image from "next/image";
import { LoginForm } from "@/components/auth/LoginForm";

export const dynamic = "force-dynamic";

/** S1 · sign-in. Entra ID for staff (production); password for dev/break-glass. */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const entraConfigured = Boolean(process.env.ENTRA_TENANT_ID);
  const devLogin = process.env.AUTH_ALLOW_DEV_LOGIN === "true";

  return (
    <div className="flex min-h-screen items-center justify-center bg-espresso px-6">
      <div className="w-full max-w-sm rounded-lg bg-cream px-8 py-10 shadow-xl">
        <div className="mb-8 flex flex-col items-center">
          <Image
            src="/brand/logo-dark.png"
            alt="essentia"
            height={22}
            width={112}
            className="mb-4 [filter:brightness(0)]"
            priority
          />
          <p className="font-body text-xs font-light tracking-wide text-label">
            every client returns
          </p>
        </div>

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

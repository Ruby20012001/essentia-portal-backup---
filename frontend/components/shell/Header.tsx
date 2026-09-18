import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "@/components/shell/UserMenu";
import { MobileNav } from "@/components/shell/MobileNav";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { SessionUser } from "@/lib/auth/session";
import { homeHref, portalMode } from "@/lib/portal-mode";

export function Header({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-brand-line bg-brand px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        {/* Home is the deployment's home, not always the dashboard. */}
        <Link href={homeHref()} aria-label="essentia portal home" className="shrink-0">
          {/* Brand rule: logo always an image, header height exactly 20px.
              The file is the white wordmark; on a light bar brightness(0)
              turns it black, which is the stand-in public/brand/README.md
              prescribes until logo-light.png is supplied. */}
          <Image
            src="/brand/logo-dark.png"
            alt="essentia"
            height={20}
            width={102}
            priority
            className="brand-mark"
          />
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3 md:gap-4">
        {/* The design deployment is locked to light in app/layout.tsx, so the
            switch would be a control that does nothing. */}
        {portalMode() === "tracker" ? null : <ThemeToggle />}
        <NotificationCenter />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

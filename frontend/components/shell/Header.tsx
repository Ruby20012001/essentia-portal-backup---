import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "@/components/shell/UserMenu";
import { MobileNav } from "@/components/shell/MobileNav";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import type { SessionUser } from "@/lib/auth/session";
import { homeHref } from "@/lib/portal-mode";

export function Header({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 bg-espresso px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        {/* Home is the deployment's home, not always the dashboard. */}
        <Link href={homeHref()} aria-label="essentia portal home" className="shrink-0">
          {/* Brand rule: logo always an image, header height exactly 20px */}
          <Image
            src="/brand/logo-dark.png"
            alt="essentia"
            height={20}
            width={102}
            priority
          />
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-3 md:gap-4">
        <ThemeToggle />
        <NotificationCenter />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

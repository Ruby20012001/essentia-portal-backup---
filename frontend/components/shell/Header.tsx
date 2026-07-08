import Image from "next/image";
import Link from "next/link";
import { UserMenu } from "@/components/shell/UserMenu";
import { NotificationCenter } from "@/components/notifications/NotificationCenter";
import type { SessionUser } from "@/lib/auth/session";

export function Header({ user }: { user: SessionUser }) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between bg-espresso px-6">
      <Link href="/dashboard" aria-label="essentia portal home">
        {/* CLAUDE.md: logo always an image, header height exactly 20px */}
        <Image
          src="/brand/logo-dark.png"
          alt="essentia"
          height={20}
          width={102}
          priority
        />
      </Link>
      <div className="flex items-center gap-4">
        <NotificationCenter />
        <UserMenu user={user} />
      </div>
    </header>
  );
}

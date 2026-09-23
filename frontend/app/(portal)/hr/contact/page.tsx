import Link from "next/link";
import { ContactBoard } from "@/components/hiring/ContactBoard";
import { getCurrentUser } from "@/lib/auth/session";
import { listContactable } from "@/lib/services/candidate-contact";
import { hiringRights } from "@/lib/services/hiring";
import { mailConfigured } from "@/lib/mail/send";

export const dynamic = "force-dynamic";

/**
 * Reaching the candidates — one screen with everybody on it.
 *
 * A candidate's own file can already send them their link. This is the screen
 * for the other question, the one HR actually opens on a Monday: who has not
 * been written to, and who never opened what was sent.
 */
export default async function ContactPage() {
  const user = await getCurrentUser();
  const rights = await hiringRights(user);

  if (!rights.see) {
    return (
      <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
        <p className="font-heading text-2xl text-white">Restricted</p>
        <p className="mx-auto mt-1 max-w-lg font-body text-sm font-light text-muted">
          Writing to candidates is HR&apos;s and the founders&apos;.
        </p>
      </div>
    );
  }

  const candidates = await listContactable(user);

  return (
    <div>
      <Link
        href="/hr"
        className="font-body text-sm text-muted underline-offset-4 hover:text-white hover:underline"
      >
        ← Hiring
      </Link>

      <div className="mb-6 mt-4">
        <h1 className="mb-1 font-heading text-4xl text-white">Reach them</h1>
        <p className="font-body text-sm font-light text-muted">
          Everybody still moving, and whether they have been sent their page.
        </p>
      </div>

      {/* Said before anything is pressed, not after a send fails. A deployment
          without mail configured is a normal state, and WhatsApp still works
          there — which is the more useful channel in this country anyway. */}
      {!mailConfigured() ? (
        <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 font-body text-sm text-warning">
          Email is not switched on for this deployment, so the email buttons
          will refuse. WhatsApp works — it opens on your machine and you press
          send.
        </p>
      ) : null}

      <ContactBoard candidates={candidates} />
    </div>
  );
}

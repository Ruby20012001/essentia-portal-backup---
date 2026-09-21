import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Design team · essentia",
  description: "Pick your name.",
  robots: { index: false, follow: false },
};

type Person = {
  id: string;
  name: string;
  role: "head" | "designer";
  deck_id: string | null;
  has_account: boolean;
};

/**
 * One page, one address, five names — the thing Monica asked to stop changing.
 *
 * Before this the five had a secret link each, and a secret link cannot be
 * shown twice: every rebuild meant minting five new ones and sending them
 * again, so they lived in chat messages and got pasted about. "Mujhe naye
 * nahi chahiye, sab ek saath rakho" — so the address is fixed and what is
 * behind it is a list of names.
 *
 * Picking a name signs you in as that person, with no password. That was put
 * to her as a choice against "name, then password", and she chose it knowing
 * that whoever opens this page can enter under any of the five. The bounds on
 * what that is worth are in [personId]/route.ts, which is also what turns the
 * whole thing off when DESIGN_TEAM_NAME_SIGNIN is not "true".
 *
 * The concept deck sits beside the tracker, because those are the two things
 * a designer opens and she should not have to be told where the other one is.
 */
export default async function DesignTeamPage() {
  if (process.env.DESIGN_TEAM_NAME_SIGNIN !== "true") notFound();

  /* The deck is matched by the name the decks are made under, the same way
     db/mint-design-links.mjs matches it — one naming rule, in two places that
     must agree. A designer with no deck simply has one link instead of two. */
  const people = await query<Person>(
    `SELECT p.id, p.name, p.role,
            d.id AS deck_id,
            (u.id IS NOT NULL AND u.is_active) AS has_account
       FROM ee.design_tracker_people p
       LEFT JOIN public.users u ON u.id = p.user_id
       LEFT JOIN ee.concept_decks d
              ON NOT d.is_archived
             AND lower(d.name) = lower(p.name) || ' — concept deck'
      WHERE p.is_active
      ORDER BY p.sort_order, p.name`,
  ).catch(() => null);

  if (!people) {
    return (
      <main className="min-h-screen bg-canvas px-4 py-10 sm:px-8">
        <div className="mx-auto max-w-2xl">
          <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
          <h1 className="mt-6 font-heading text-2xl font-light text-primary">Design team</h1>
          <p className="mt-3 font-body text-sm font-light leading-relaxed text-secondary">
            This cannot be reached at the moment. Try again in a few minutes.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-canvas px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-2xl">
        <Image src="/brand/logo-dark.png" alt="essentia" height={20} width={102} priority />
        <h1 className="mt-6 font-heading text-2xl font-light text-primary">Design team</h1>
        <p className="mt-2 font-body text-sm font-light text-secondary">
          Pick your name — your board opens straight away.
        </p>

        <ul className="mt-8 space-y-2.5">
          {people.map((p) => {
            const head = p.role === "head";
            return (
              <li
                key={p.id}
                className={`rounded-lg border px-5 py-4 ${
                  head ? "border-amber-deep bg-card" : "border-line bg-card"
                }`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-heading text-lg text-primary">{p.name}</span>
                  <span className="font-body text-xs font-light text-muted">
                    {head ? "the whole board · read only" : "her own tracker · she can edit it"}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {p.has_account ? (
                    /* A plain <a>, not next/link, and this matters. The href
                       is a route handler that answers with a redirect and a
                       Set-Cookie; asking the client router to "navigate" to
                       that is asking it to follow a redirect it cannot see
                       and to notice a cookie it does not read. It worked on
                       one machine and did nothing on Monica's, which is the
                       worst way for it to behave. A full page load has no
                       such opinion — the browser follows the redirect, keeps
                       the cookie, and lands on the board. */
                    <a
                      href={`/design-team/${p.id}`}
                      className="rounded border border-line-strong bg-canvas px-3 py-2 font-body text-[13px] font-light text-ink transition-colors hover:border-amber-deep"
                    >
                      {head ? "Open the dashboard" : "Open the tracker"}
                    </a>
                  ) : (
                    <span className="font-body text-[13px] font-light text-muted">
                      No portal account yet
                    </span>
                  )}

                  {p.deck_id ? (
                    /* The deck is served outside the portal shell and opens
                       the tool, not a React page — the same full load. */
                    <a
                      href={`/deck/${p.deck_id}`}
                      className="rounded border border-line-strong bg-canvas px-3 py-2 font-body text-[13px] font-light text-ink transition-colors hover:border-amber-deep"
                    >
                      Concept deck
                    </a>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 font-body text-xs font-light leading-relaxed text-muted">
          This page is for the design team. Anyone who opens it can go in under any of these
          five names, so keep the address inside the team.
        </p>
      </div>
    </main>
  );
}

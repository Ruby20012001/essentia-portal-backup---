import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Design team · essentia",
  description: "Apna naam chuniye.",
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
            Abhi khul nahi raha. Kuch minute baad dobara try kijiye.
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
          Apna naam chuniye — seedha aapka board khul jayega.
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
                    {head ? "poora board · sirf dekhne ke liye" : "apna tracker · edit kar sakti hai"}
                  </span>
                </div>

                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {p.has_account ? (
                    <Link
                      href={`/design-team/${p.id}`}
                      className="rounded border border-line-strong bg-canvas px-3 py-2 font-body text-[13px] font-light text-ink transition-colors hover:border-amber-deep"
                    >
                      {head ? "Dashboard kholo" : "Tracker kholo"}
                    </Link>
                  ) : (
                    <span className="font-body text-[13px] font-light text-muted">
                      Portal account abhi nahi bana
                    </span>
                  )}

                  {p.deck_id ? (
                    <Link
                      href={`/deck/${p.deck_id}`}
                      className="rounded border border-line-strong bg-canvas px-3 py-2 font-body text-[13px] font-light text-ink transition-colors hover:border-amber-deep"
                    >
                      Concept deck
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 font-body text-xs font-light leading-relaxed text-muted">
          Yeh page sirf design team ke liye hai. Jo bhi ise khole, wo in paanch naamon me se kisi
          bhi naam se andar ja sakta hai — isliye iska pata bahar mat dijiye.
        </p>
      </div>
    </main>
  );
}

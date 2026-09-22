import type { Metadata } from "next";
import { headers } from "next/headers";
import { CandidatePage } from "@/components/hiring/CandidatePage";
import { openCandidatePage } from "@/lib/services/candidate-portal";

export const dynamic = "force-dynamic";

/**
 * The candidate's own page — the one route in this application that a
 * stranger is meant to be able to open.
 *
 * It sits outside `(portal)` on purpose: no sidebar, no navigation into the
 * rest of the company, nothing that implies there is more of this to reach.
 * The token in the path is the whole of the authentication, and
 * `openCandidatePage` treats it as though it has already leaked.
 *
 * `noindex` because a page reachable without a login is a page a crawler can
 * reach if the link ever appears anywhere public, and this one has a person's
 * name and interview times on it.
 */
export const metadata: Metadata = {
  title: "Your interview · essentia",
  robots: { index: false, follow: false, nocache: true },
};

export default async function InterviewPage({
  params,
}: {
  params: { token: string };
}) {
  /* `headers()` also marks this route as dynamic for real — a page that got
     cached would be one candidate's interview served to the next holder of
     any link. */
  const forwarded = headers().get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0]!.trim() : null;

  const view = await openCandidatePage(params.token, ip);
  if (!view) return <LinkDoesNotWork />;

  return <CandidatePage token={params.token} view={view} />;
}

/**
 * Every failure lands here and says the same thing.
 *
 * Expired, withdrawn, mistyped, or belonging to somebody the company has
 * finished with — the page cannot distinguish between them out loud, or it
 * becomes a way to work out which links once existed and what happened to the
 * person behind them. "No longer works" covers all of it and points at a
 * human, which is the only useful next step anyway.
 */
function LinkDoesNotWork() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-5 py-16">
      <p className="mb-3 font-body text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
        essentia group
      </p>
      <h1 className="mb-3 font-heading text-3xl leading-tight text-white">
        This link no longer works
      </h1>
      <p className="font-body text-[15px] font-light leading-relaxed text-secondary">
        Interview links are set to expire. If you are still expecting to hear
        from us, reply to the email that brought you here and somebody will
        send you a new one.
      </p>
    </main>
  );
}

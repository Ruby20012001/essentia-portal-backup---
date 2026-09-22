"use client";

import { useRef, useState } from "react";
import type {
  CandidateRound,
  CandidateView,
  RoundResponse,
} from "@/lib/services/candidate-portal";

/**
 * What a candidate sees. The only page in the portal written for somebody who
 * does not work here.
 *
 * IT IS NOT THE BOARD IN A LIGHTER COLOUR. Everything on the hiring board is
 * there to help HR decide; nothing here is. This page answers the four
 * questions a person who has applied for a job actually has — when is it,
 * where is it, who am I meeting, and what if I cannot make it — and asks one
 * thing back.
 *
 * No stage count, no "you are 3 of 7 candidates", no progress bar through a
 * pipeline they are not party to. A candidate reading that their next round
 * is with the HOD is reading their own diary. A candidate reading how many
 * people are ahead of them is reading ours.
 *
 * Times are rendered in Asia/Kolkata, named rather than taken from the
 * machine — somebody opening this from another timezone must see the hour
 * they are expected, not the hour their laptop translates it into.
 */

const IST_FULL = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function fullWhen(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : IST_FULL.format(at);
}

function modeWords(mode: CandidateRound["mode"]): string {
  if (mode === "video") return "Video call";
  if (mode === "phone") return "Phone call";
  return "In person";
}

function listNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type Banner = { tone: "error" | "success"; message: string };

export function CandidatePage({
  token,
  view,
}: {
  token: string;
  view: CandidateView;
}) {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  /* This page has no session to revalidate against, so a reply that the
     server accepted is remembered here and the round redraws at once. Without
     it, pressing the button looks like nothing happened. */
  const [replied, setReplied] = useState<Record<string, RoundResponse>>({});
  const [sentFile, setSentFile] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function reply(
    interviewId: string,
    response: RoundResponse,
    note: string | null,
  ) {
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/interview/${token}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId, response, note }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? "That did not go through." });
        return;
      }
      setReplied({ ...replied, [interviewId]: response });
      setAsking(null);
      setReason("");
      setBanner({
        tone: "success",
        message:
          response === "confirmed"
            ? "Thank you — we have told the team to expect you."
            : "Thank you — we will find another time and write to you.",
      });
    } catch {
      setBanner({ tone: "error", message: "The connection dropped. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    setBusy(true);
    setBanner(null);
    try {
      const body = new FormData();
      body.append("file", file);
      body.append("kind", "resume");
      const res = await fetch(`/api/interview/${token}/document`, {
        method: "POST",
        body,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setBanner({ tone: "error", message: data.error ?? "That file did not go through." });
        return;
      }
      setSentFile(file.name);
      setBanner({ tone: "success", message: "Thank you — we have your CV." });
    } catch {
      setBanner({ tone: "error", message: "The connection dropped. Try again." });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const ahead = view.rounds.filter((r) => r.status === "scheduled");
  const past = view.rounds.filter((r) => r.status !== "scheduled");

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12 sm:py-16">
      <header className="mb-10">
        <p className="mb-3 font-body text-[11px] font-bold uppercase tracking-[0.2em] text-muted">
          essentia group
        </p>
        <h1 className="mb-2 font-heading text-3xl leading-tight text-white sm:text-4xl">
          Hello {view.fullName.split(" ")[0]}
        </h1>
        <p className="font-body text-[15px] font-light leading-relaxed text-secondary">
          You are speaking to us about the{" "}
          <span className="text-white">{view.roleTitle}</span> role. Everything
          arranged so far is below — please tell us whether each time works.
        </p>
      </header>

      {banner ? (
        <div
          role="status"
          className={`mb-8 rounded-lg border px-4 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-error/40 bg-error/10 text-error"
              : "border-success/40 bg-success/10 text-success"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <section className="mb-10">
        <h2 className="mb-4 font-heading text-xl text-white">
          {ahead.length === 1 ? "Your interview" : "Your interviews"}
        </h2>

        {ahead.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-10 text-center font-body text-sm font-light text-muted">
            Nothing is booked at the moment. When a time is arranged it will
            appear here, and we will write to you.
          </p>
        ) : (
          <ul className="space-y-4">
            {ahead.map((round) => {
              const answer = replied[round.id] ?? round.reply?.response ?? null;
              return (
                <li
                  key={round.id}
                  className="rounded-xl border border-line bg-card p-5 sm:p-6"
                >
                  <div className="mb-4">
                    <p className="mb-1 font-body text-[11px] font-bold uppercase tracking-[0.15em] text-muted">
                      {round.stage}
                    </p>
                    <p className="font-heading text-xl leading-snug text-white">
                      {fullWhen(round.scheduledAt)}
                    </p>
                    <p className="mt-1 font-body text-sm font-light text-secondary">
                      {modeWords(round.mode)} · {round.durationMins} minutes
                    </p>
                  </div>

                  {round.location ? (
                    <p className="mb-3 font-body text-sm font-light text-secondary">
                      <span className="text-muted">Where </span>
                      {/* A meeting link is text here, not an anchor. This page
                          renders a location typed by whoever booked the round,
                          and a page with no login on it should not turn
                          somebody else's input into something to click. */}
                      <span className="break-words text-white">{round.location}</span>
                    </p>
                  ) : null}

                  {round.meeting.length > 0 ? (
                    <p className="mb-4 font-body text-sm font-light text-secondary">
                      <span className="text-muted">Who </span>
                      <span className="text-white">{listNames(round.meeting)}</span>
                    </p>
                  ) : null}

                  {answer === "confirmed" ? (
                    <p className="rounded-lg bg-success/10 px-4 py-3 font-body text-sm text-success">
                      You have confirmed this one. We will see you then.
                    </p>
                  ) : answer === "reschedule_requested" ? (
                    <p className="rounded-lg bg-warning/10 px-4 py-3 font-body text-sm text-warning">
                      You have asked us to move this. We will write to you with
                      another time.
                    </p>
                  ) : asking === round.id ? (
                    <div className="rounded-lg border border-line-strong bg-surface p-4">
                      <label
                        htmlFor={`why-${round.id}`}
                        className="mb-2 block font-body text-sm font-light text-secondary"
                      >
                        What would work better?
                      </label>
                      <textarea
                        id={`why-${round.id}`}
                        rows={3}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Any afternoon next week, or after the 12th…"
                        className="mb-3 w-full rounded-lg border border-line bg-card px-3 py-2 font-body text-sm text-white placeholder:text-muted focus:border-line-strong focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy || reason.trim().length === 0}
                          onClick={() =>
                            reply(round.id, "reschedule_requested", reason)
                          }
                          className="rounded-lg bg-white px-4 py-2 font-body text-sm font-bold text-espresso disabled:opacity-40"
                        >
                          Send
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setAsking(null);
                            setReason("");
                          }}
                          className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-secondary hover:bg-hover"
                        >
                          Never mind
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => reply(round.id, "confirmed", null)}
                        className="rounded-lg bg-white px-5 py-2.5 font-body text-sm font-bold text-espresso hover:bg-white/90 disabled:opacity-40"
                      >
                        I will be there
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setAsking(round.id)}
                        className="rounded-lg border border-line px-5 py-2.5 font-body text-sm font-bold text-secondary hover:bg-hover disabled:opacity-40"
                      >
                        I cannot make this time
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {past.length > 0 ? (
        <section className="mb-10">
          <h2 className="mb-3 font-heading text-xl text-white">Already met</h2>
          <ul className="space-y-2">
            {past.map((round) => (
              <li
                key={round.id}
                className="rounded-lg border border-line bg-card px-4 py-3 font-body text-sm font-light text-secondary"
              >
                <span className="text-white">{round.stage}</span> ·{" "}
                {fullWhen(round.scheduledAt)}
              </li>
            ))}
          </ul>
          {/* Deliberately nothing about how it went. What the room thought is
              the room's, and a candidate learning they did badly from a web
              page is the thing this module exists to prevent. */}
        </section>
      ) : null}

      <section className="mb-12">
        <h2 className="mb-2 font-heading text-xl text-white">Your CV</h2>
        <p className="mb-4 font-body text-sm font-light leading-relaxed text-secondary">
          If you have not sent one, or the one we have is out of date, put it
          here and everybody you meet will have read it.
        </p>

        {view.documents.length > 0 || sentFile ? (
          <p className="mb-3 rounded-lg border border-line bg-card px-4 py-3 font-body text-sm text-secondary">
            We have{" "}
            <span className="text-white">
              {sentFile ?? view.documents[0]!.filename}
            </span>
            . Sending another replaces it.
          </p>
        ) : null}

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-line-strong bg-card px-4 py-4 font-body text-sm font-light text-secondary file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-white file:px-4 file:py-2 file:font-body file:text-sm file:font-bold file:text-espresso disabled:opacity-40"
        />
        <p className="mt-2 font-body text-xs font-light text-muted">
          PDF or Word, up to 5 MB.
        </p>
      </section>

      <footer className="border-t border-line pt-6">
        <p className="font-body text-xs font-light leading-relaxed text-muted">
          This page is yours alone — please do not forward the link. If
          something here looks wrong, reply to the email that brought you here
          and a person will pick it up.
        </p>
      </footer>
    </main>
  );
}

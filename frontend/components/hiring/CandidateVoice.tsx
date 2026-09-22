"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CandidateRound, RoundResponse } from "@/lib/services/candidate-portal";
import { readAnswer } from "@/lib/hiring/spoken-answer";

/**
 * Answering by voice, on the candidate's own page.
 *
 * WHY THERE IS NO AI IN HERE, AND WHY THAT IS THE POINT.
 *
 * A voice agent on the phone needs a model because it has to work out who it
 * is talking to and what they want. This has neither problem. The page was
 * opened with a token, so it already knows who this is — the whole
 * three-attempts name check that `voice-agent.ts` exists for is simply not a
 * question here. And the conversation has exactly two possible outcomes: they
 * can make it, or they cannot and here is why.
 *
 * So this is the browser's own SpeechRecognition and SpeechSynthesis, which
 * cost nothing, need no account, no API key and no provider. It reads out
 * what is booked and listens for yes or no. Adding a model would add a bill,
 * a dependency and a way to be talked into something, and would answer no
 * question that is actually being asked.
 *
 * IT NEVER SENDS WHAT IT ONLY THINKS IT HEARD. Recognition is wrong often
 * enough that a misheard reason is worse than no reason — "I can do Tuesday"
 * arriving as "I can't do Tuesday" would have somebody rebook the wrong way.
 * So every word it hears is put on the screen, and nothing reaches the server
 * until the person has looked at it and pressed the button. Voice fills the
 * form; the person still sends it.
 *
 * IT IS NEVER THE ONLY WAY. The buttons this sits above work on their own and
 * always have. This appears only where the browser supports it — Chrome and
 * Edge, partially Safari, not Firefox — and its absence costs nobody
 * anything.
 *
 * WHAT THE CANDIDATE IS TOLD. Chrome does recognition on Google's servers, so
 * this is somebody's voice leaving their machine. That is said plainly on the
 * screen before the microphone is ever asked for, because it is their voice
 * and their choice.
 */

/* The browser's speech types are not in TypeScript's DOM library. These are
   the parts actually used, and no more — a fuller set would be copied from
   somewhere and unverified. */
type SpeechResult = { transcript: string };
type SpeechAlternatives = { 0: SpeechResult; isFinal: boolean; length: number };
type SpeechResultList = { length: number; [i: number]: SpeechAlternatives };
type SpeechEvent = { resultIndex: number; results: SpeechResultList };

type Recogniser = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type RecogniserCtor = new () => Recogniser;

function recogniserCtor(): RecogniserCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecogniserCtor;
    webkitSpeechRecognition?: RecogniserCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const IST = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

type Step = "idle" | "speaking" | "listening" | "confirm-no" | "sending" | "done";

export function CandidateVoice({
  token,
  round,
  onReplied,
}: {
  token: string;
  round: CandidateRound;
  /* The page owns what a round looks like once answered; this only reports
     that it happened. Two components drawing the same state from two places
     is how they end up disagreeing. */
  onReplied: (interviewId: string, response: RoundResponse) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [transcript, setTranscript] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hindi, setHindi] = useState(false);
  const recogniser = useRef<Recogniser | null>(null);

  /* Support is decided after mount, never during render: the server has no
     window, and guessing would mean the markup changes under React on the
     first frame. */
  useEffect(() => {
    setSupported(recogniserCtor() !== null && "speechSynthesis" in window);
  }, []);

  /* A page that is navigated away from while listening leaves the microphone
     on. The browser eventually notices; the person notices sooner. */
  useEffect(() => {
    return () => {
      recogniser.current?.abort();
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const say = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = hindi ? "hi-IN" : "en-IN";
        u.rate = 0.95;
        u.onend = () => resolve();
        // If speech fails there is nothing to wait for, and the flow should
        // carry on to listening rather than stall on a silent promise.
        u.onerror = () => resolve();
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(u);
      }),
    [hindi],
  );

  const listen = useCallback((): Promise<string> => {
    const Ctor = recogniserCtor();
    if (!Ctor) return Promise.resolve("");

    return new Promise((resolve) => {
      const r = new Ctor();
      recogniser.current = r;
      r.lang = hindi ? "hi-IN" : "en-IN";
      r.continuous = false;
      r.interimResults = true;
      r.maxAlternatives = 1;

      let best = "";
      r.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i += 1) {
          text += e.results[i]![0].transcript;
        }
        best = text.trim();
        setTranscript(best);
      };
      r.onerror = (e) => {
        if (e.error === "not-allowed") {
          setError(
            "The microphone was not allowed. You can still use the buttons below.",
          );
        } else if (e.error !== "aborted" && e.error !== "no-speech") {
          setError("The microphone did not work. The buttons below still do.");
        }
      };
      r.onend = () => {
        recogniser.current = null;
        resolve(best);
      };
      try {
        r.start();
      } catch {
        resolve("");
      }
    });
  }, [hindi]);

  async function send(response: RoundResponse, note: string | null) {
    setStep("sending");
    try {
      const res = await fetch(`/api/interview/${token}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewId: round.id, response, note }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That did not go through.");
        setStep("idle");
        return;
      }
      onReplied(round.id, response);
      setStep("done");
      await say(
        response === "confirmed"
          ? hindi
            ? "Shukriya. Hum team ko bata dete hain."
            : "Thank you. We have told the team to expect you."
          : hindi
            ? "Shukriya. Hum naya time bhej denge."
            : "Thank you. We will write to you with another time.",
      );
    } catch {
      setError("The connection dropped. Try again.");
      setStep("idle");
    }
  }

  async function begin() {
    setError(null);
    setTranscript("");
    setStep("speaking");

    const when = IST.format(new Date(round.scheduledAt));
    const who =
      round.meeting.length > 0
        ? hindi
          ? ` Aap ${round.meeting.join(", ")} se milenge.`
          : ` You will meet ${round.meeting.join(" and ")}.`
        : "";
    const where = round.location
      ? hindi
        ? ` Jagah: ${round.location}.`
        : ` At ${round.location}.`
      : "";

    await say(
      hindi
        ? `Aapka ${round.stage} ${when} ko hai, ${round.durationMins} minute ka.${where}${who} Kya ye time theek hai?`
        : `Your ${round.stage} is on ${when}, for ${round.durationMins} minutes.${where}${who} Does this time work for you?`,
    );

    setStep("listening");
    const answer = await listen();
    const verdict = readAnswer(answer);

    if (verdict === "yes") {
      await send("confirmed", null);
      return;
    }
    if (verdict === "no") {
      setStep("speaking");
      await say(
        hindi
          ? "Koi baat nahi. Kaunsa din ya time theek rahega?"
          : "That is all right. What day or time would work better?",
      );
      setStep("listening");
      const why = await listen();
      setReason(why);
      // Never sent on the strength of what was heard. They read it first.
      setStep("confirm-no");
      return;
    }

    setError(
      hindi
        ? "Samajh nahi aaya. Dobara boliye, ya neeche ke buttons use kijiye."
        : "I did not catch that. Try again, or use the buttons below.",
    );
    setStep("idle");
  }

  function stop() {
    recogniser.current?.abort();
    window.speechSynthesis?.cancel();
    setStep("idle");
  }

  if (!supported) return null;

  return (
    <div className="mb-4 rounded-lg border border-line-strong bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-sm font-bold text-white">
          {hindi ? "Bol kar jawab dijiye" : "Answer by speaking"}
        </p>
        <button
          type="button"
          onClick={() => setHindi(!hindi)}
          disabled={step !== "idle" && step !== "done"}
          className="rounded border border-line px-2 py-1 font-body text-xs text-secondary hover:bg-hover disabled:opacity-40"
        >
          {hindi ? "English" : "हिंदी"}
        </button>
      </div>

      <p className="mb-3 font-body text-xs font-light leading-relaxed text-muted">
        {hindi
          ? "Aapka browser aawaz pehchanne ke liye use karega. Nothing is sent until you have read it and pressed send."
          : "Your browser handles the listening, and it sends the audio to its own speech service to do that. Nothing reaches essentia until you have read it back and pressed send."}
      </p>

      {error ? (
        <p className="mb-3 rounded border border-error/40 bg-error/10 px-3 py-2 font-body text-sm text-error">
          {error}
        </p>
      ) : null}

      {transcript && step !== "confirm-no" ? (
        <p className="mb-3 font-body text-sm font-light text-secondary">
          <span className="text-muted">Heard: </span>“{transcript}”
        </p>
      ) : null}

      {step === "confirm-no" ? (
        <div>
          <label
            htmlFor={`heard-${round.id}`}
            className="mb-2 block font-body text-sm font-light text-secondary"
          >
            {hindi
              ? "Ye hamne suna. Theek kar lijiye, phir bhejiye."
              : "This is what we heard. Correct it if it is wrong, then send."}
          </label>
          <textarea
            id={`heard-${round.id}`}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mb-3 w-full rounded-lg border border-line bg-card px-3 py-2 font-body text-sm text-white focus:border-line-strong focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={reason.trim().length === 0}
              onClick={() => send("reschedule_requested", reason)}
              className="rounded-lg bg-white px-4 py-2 font-body text-sm font-bold text-espresso disabled:opacity-40"
            >
              {hindi ? "Bhejiye" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("idle");
                setReason("");
                setTranscript("");
              }}
              className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-secondary hover:bg-hover"
            >
              {hindi ? "Rehne dijiye" : "Never mind"}
            </button>
          </div>
        </div>
      ) : step === "idle" ? (
        <button
          type="button"
          onClick={begin}
          className="rounded-lg border border-line-strong px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
        >
          {hindi ? "Baat kijiye" : "Talk to us"}
        </button>
      ) : step === "done" ? (
        <p className="font-body text-sm text-success">
          {hindi ? "Bhej diya." : "Sent."}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-body text-sm text-secondary">
            {step === "speaking"
              ? hindi
                ? "Bol raha hai…"
                : "Speaking…"
              : step === "listening"
                ? hindi
                  ? "Sun raha hai…"
                  : "Listening…"
                : hindi
                  ? "Bhej raha hai…"
                  : "Sending…"}
          </span>
          <button
            type="button"
            onClick={stop}
            className="rounded-lg border border-line px-3 py-1.5 font-body text-xs font-bold text-secondary hover:bg-hover"
          >
            {hindi ? "Rokiye" : "Stop"}
          </button>
        </div>
      )}
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { listDeskProjects } from "@/lib/services/project-desk";
import { forAssistant, todayIST } from "@/lib/services/project-desk-logic";
import { toErrorResponse } from "@/lib/api/errors";

export const dynamic = "force-dynamic";
// The SDK needs Node, not the Edge runtime.
export const runtime = "nodejs";

const FRIENDLY_ERROR = "The assistant could not answer just now. Try again.";

/**
 * The Project Desk assistant. Reads every project, works out what is late and
 * how far each site has got, and streams Claude's answer back as plain text.
 *
 * ANTHROPIC_API_KEY is read here, on the server, and never leaves it: the
 * browser only ever sees the words of the answer.
 */
export async function POST(request: NextRequest) {
  try {
    await getCurrentUser();
  } catch (error) {
    return toErrorResponse(error);
  }

  const parsed = z
    .object({ question: z.string().trim().min(1).max(2000) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type a question first." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[project-desk/ask] ANTHROPIC_API_KEY is not set");
    return NextResponse.json({ error: FRIENDLY_ERROR }, { status: 503 });
  }

  let projects;
  try {
    projects = await listDeskProjects();
  } catch (error) {
    console.error("[project-desk/ask] could not read projects", error);
    return NextResponse.json({ error: FRIENDLY_ERROR }, { status: 500 });
  }

  const today = todayIST();
  const dateLine = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const system =
    `You are the project assistant for Essentia, a luxury interior design and furniture company in India. ` +
    `Today is ${dateLine} (${today}). You are given the live project tracker as JSON. ` +
    `Answer using only this data. Use plain, simple English and short lines. Do not use em dashes. ` +
    `No markdown headings or bold; simple "- " bullets are fine. If the data does not have the answer, say so. ` +
    `When asked to draft client messages, keep them polite and formal, as from a luxury brand.`;

  const client = new Anthropic();
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wroteAnything = false;
      try {
        const stream = client.beta.messages.stream({
          model: "claude-sonnet-5-5",
          max_tokens: 16000,
          output_config: { effort: "medium" },
          // If a safety classifier declines, the API reruns the request on
          // Anthropic's recommended fallback instead of answering nothing.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          messages: [
            {
              role: "user",
              content:
                `<projects>\n${JSON.stringify(forAssistant(projects, today), null, 1)}\n</projects>\n\n` +
                parsed.data.question,
            },
          ],
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            wroteAnything = true;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal" || !wroteAnything) {
          controller.enqueue(encoder.encode(wroteAnything ? `\n\n${FRIENDLY_ERROR}` : FRIENDLY_ERROR));
        }
      } catch (error) {
        if (error instanceof Anthropic.APIError) {
          console.error(`[project-desk/ask] Anthropic API ${error.status}: ${error.message}`);
        } else {
          console.error("[project-desk/ask]", error);
        }
        controller.enqueue(encoder.encode(wroteAnything ? `\n\n${FRIENDLY_ERROR}` : FRIENDLY_ERROR));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

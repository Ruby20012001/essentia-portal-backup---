"use client";

import { useCallback, useState } from "react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CreateWioPanel } from "@/components/wio/CreateWioPanel";
import { WioTable } from "@/components/wio/WioTable";
import { PioTable } from "@/components/wio/PioTable";
import type { Wio } from "@/lib/services/wio";
import type { Pio } from "@/lib/services/pio";
import type { ProjectOption } from "@/lib/services/projects";

type Banner = { tone: "error" | "success"; message: string };

/**
 * S4 client shell: owns hub state and mutations. Every refusal from a
 * blocking rule (§29/§30) or the approval chain surfaces verbatim in the
 * banner — the system never blocks silently.
 */
export function WioPioHub({
  initialWios,
  initialPios,
  projects,
  wioDepartments,
  departmentNames,
}: {
  initialWios: Wio[];
  initialPios: Pio[];
  projects: ProjectOption[];
  wioDepartments: string[];
  departmentNames: Record<string, string>;
}) {
  const [wios, setWios] = useState(initialWios);
  const [pios, setPios] = useState(initialPios);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [wioRes, pioRes] = await Promise.all([
      fetch("/api/wio"),
      fetch("/api/pio"),
    ]);
    if (wioRes.ok) setWios((await wioRes.json()).wios);
    if (pioRes.ok) setPios((await pioRes.json()).pios);
  }, []);

  async function call(
    busyKey: string,
    path: string,
    init: RequestInit,
    successMessage?: string,
  ): Promise<boolean> {
    setBusyId(busyKey);
    setBanner(null);
    try {
      const response = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", ...init.headers },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBanner({
          tone: "error",
          message: data.error ?? `Request failed (${response.status})`,
        });
        return false;
      }
      await refresh();
      if (successMessage) setBanner({ tone: "success", message: successMessage });
      return true;
    } finally {
      setBusyId(null);
    }
  }

  const overdueOrRed = wios.filter(
    (w) => w.isOverdue || w.clockRag === "red",
  ).length;
  const awaitingTriangle = pios.filter((p) => !p.triangleComplete).length;
  const inApproval = pios.filter(
    (p) => p.approval?.status === "pending",
  ).length;

  return (
    <div>
      {banner ? (
        <div
          role="alert"
          className={`mb-6 rounded-lg border-l-4 px-5 py-3 font-body text-sm ${
            banner.tone === "error"
              ? "border-alert bg-alert/5 font-bold text-alert"
              : "border-forest bg-forest/5 font-light text-forest"
          }`}
        >
          {banner.message}
        </div>
      ) : null}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="WIOs on the clock" value={String(wios.length)} />
        <MetricCard label="Red / overdue" value={String(overdueOrRed)} />
        <MetricCard label="PIOs awaiting Triangle" value={String(awaitingTriangle)} />
        <MetricCard label="In approval chain" value={String(inApproval)} />
      </div>

      <div className="mb-10">
        <CreateWioPanel
          projects={projects}
          wioDepartments={wioDepartments}
          departmentNames={departmentNames}
          busy={busyId === "create"}
          onCreate={(input) =>
            call("create", "/api/wio", {
              method: "POST",
              body: JSON.stringify(input),
            }, "WIO created — the 15-day conversion clock is running.")
          }
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">
          WIO conversion clock
        </h2>
        <WioTable
          wios={wios}
          busyId={busyId}
          onPatch={(wio, patch) =>
            call(wio.id, `/api/wio/${wio.id}`, {
              method: "PATCH",
              body: JSON.stringify(patch),
            })
          }
          onConvert={(wio) =>
            call(wio.id, `/api/wio/${wio.id}/convert`, { method: "POST" },
              `${wio.wioNumber} converted — PIO created and the 45-day factory clock is running.`)
          }
        />
      </section>

      <section id="pio">
        <h2 className="mb-3 font-heading text-2xl text-white">
          PIO factory clock · Triangle of Agreement
        </h2>
        <PioTable
          pios={pios}
          busyId={busyId}
          onPatch={(pio, patch) =>
            call(pio.id, `/api/pio/${pio.id}`, {
              method: "PATCH",
              body: JSON.stringify(patch),
            })
          }
          onRequestApproval={(pio) =>
            call(pio.id, `/api/pio/${pio.id}/request-approval`, { method: "POST" },
              `${pio.pioNumber} sent into the approval chain (Khushpreet → Deepak Ji → Hardesh).`)
          }
          onAct={(pio, action) =>
            pio.approval
              ? call(pio.id, `/api/workflows/${pio.approval.instanceId}/act`, {
                  method: "POST",
                  body: JSON.stringify({ action }),
                })
              : undefined
          }
        />
      </section>
    </div>
  );
}

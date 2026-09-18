"use client";

/**
 * The dashboard's other shapes — columns, a treemap and a gauge — in plain
 * SVG/HTML, to the same rules as the donut: the tracker's status colours, a
 * value written beside every mark, and a title on each so hovering says what
 * it is.
 */

export type Column = { key: string; label: string; value: number; tone: string; title?: string };

/** Columns for a count over time. Values sit above the bars, so no y-axis is needed. */
export function Columns({ columns, height = 150 }: { columns: Column[]; height?: number }) {
  const max = Math.max(1, ...columns.map((c) => c.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {columns.map((c) => (
        <div key={c.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="font-body text-[11px] font-bold text-ink">{c.value > 0 ? c.value : ""}</span>
          <div
            title={c.title ?? `${c.label}: ${c.value}`}
            className={`w-full rounded-t ${c.value > 0 ? c.tone : "bg-line-strong/50"}`}
            style={{ height: `${Math.max(2, (c.value / max) * 100)}%` }}
          />
          <span className="font-body text-[10.5px] font-light text-muted">{c.label}</span>
        </div>
      ))}
    </div>
  );
}

export type TreeGroup = {
  key: string;
  label: string;
  value: number;
  items: { key: string; label: string; value: number; tone: string; title: string; onClick?: () => void }[];
  onClick?: () => void;
};

/**
 * A treemap, laid out slice-and-dice: a column per group, its width the
 * group's share; inside it a box per item, its height the item's share. Simple,
 * stable, and it never reorders itself the way a squarified layout does.
 */
export function Treemap({ groups, height = 220 }: { groups: TreeGroup[]; height?: number }) {
  const total = groups.reduce((n, g) => n + g.value, 0);
  if (total <= 0) return null;
  return (
    <div className="flex w-full gap-[3px] overflow-hidden rounded" style={{ height }}>
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-[3px]" style={{ width: `${(g.value / total) * 100}%` }}>
          <button
            type="button"
            onClick={g.onClick}
            className="truncate rounded bg-surface px-2 py-1 text-left font-body text-[11px] font-bold text-ink transition-colors hover:bg-hover"
            title={`${g.label}: ${g.value}`}
          >
            {g.label}
          </button>
          <div className="flex flex-1 flex-col gap-[3px]">
            {g.items.map((it) => (
              <button
                key={it.key}
                type="button"
                title={it.title}
                onClick={it.onClick}
                className={`min-h-[1.5rem] overflow-hidden rounded px-2 py-1 text-left transition-opacity hover:opacity-85 ${it.tone}`}
                style={{ height: `${(it.value / g.value) * 100}%` }}
              >
                <span className="block truncate font-body text-[11px] font-bold text-cream">{it.label}</span>
                <span className="block truncate font-body text-[10.5px] font-light text-cream/80">{it.value}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A gauge — one ratio against its whole, drawn as a half ring with the number
 * inside and both ends labelled, the way a dashboard's headline meter reads.
 */
export function Gauge({
  value,
  max,
  tone,
  centre,
  centreSub,
  minLabel,
  maxLabel,
  title,
}: {
  value: number;
  max: number;
  tone: string;
  centre: string;
  centreSub?: string;
  minLabel: string;
  maxLabel: string;
  title: string;
}) {
  // A semicircle of radius 40: its length is π·40 ≈ 125.66.
  const LEN = Math.PI * 40;
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const path = "M 10 50 A 40 40 0 0 1 90 50";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 100 62" className="w-full max-w-[16rem]" role="img" aria-label={title}>
        <title>{title}</title>
        <path d={path} fill="none" strokeWidth={11} strokeLinecap="round" className="stroke-line-strong/60" />
        {pct > 0 ? (
          <path
            d={path}
            fill="none"
            strokeWidth={11}
            strokeLinecap="round"
            stroke="currentColor"
            strokeDasharray={`${LEN * pct} ${LEN}`}
            className={tone}
          />
        ) : null}
        <text x="50" y="47" textAnchor="middle" className="fill-white font-body text-[14px] font-light">
          {centre}
        </text>
        {centreSub ? (
          <text x="50" y="57" textAnchor="middle" className="fill-muted font-body text-[5px] font-light uppercase tracking-[0.14em]">
            {centreSub}
          </text>
        ) : null}
      </svg>
      <div className="flex w-full max-w-[16rem] justify-between font-body text-[10.5px] font-light text-muted">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

/** The big number card a Power BI page leads with. */
export function BigNumber({
  value,
  label,
  tone = "text-white",
  sub,
}: {
  value: string | number;
  label: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="flex h-full flex-col justify-center rounded-lg border border-line bg-surface px-5 py-4 text-center">
      <p className={`font-body text-4xl font-light leading-none ${tone}`}>{value}</p>
      <p className="mt-2 font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">{label}</p>
      {sub ? <p className="mt-1 font-body text-[11px] font-light text-secondary">{sub}</p> : null}
    </div>
  );
}

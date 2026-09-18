"use client";

/**
 * The dashboard's circles — one donut and one ring, both plain SVG.
 *
 * A donut is only honest for part-to-whole with a handful of slices, so this
 * one caps at five and folds the rest into "other"; a ring is a meter — one
 * ratio against its whole. Colour is the tracker's status language and every
 * slice is also named in the legend beside it, never colour alone.
 *
 * Geometry note: arcs are drawn on a circle of circumference 100 (r = 100/2π),
 * so a slice's length IS its percentage — stroke-dasharray does the maths and
 * there is no path arithmetic to get wrong.
 */

const R = 100 / (2 * Math.PI);
const BOX = 44;
const CENTRE = BOX / 2;

export type Slice = {
  key: string;
  label: string;
  value: number;
  /** Tailwind text-* token; the arc is drawn in currentColor. */
  tone: string;
  onClick?: () => void;
  dimmed?: boolean;
};

export function Donut({
  slices,
  total,
  centreValue,
  centreLabel,
  thickness = 7,
}: {
  slices: Slice[];
  total: number;
  centreValue: string | number;
  centreLabel: string;
  thickness?: number;
}) {
  const shown = slices.filter((s) => s.value > 0);
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${BOX} ${BOX}`} className="h-44 w-44 -rotate-90" role="img" aria-label={centreLabel}>
      <circle cx={CENTRE} cy={CENTRE} r={R} fill="none" strokeWidth={thickness} className="stroke-line-strong/60" />
      {shown.map((s) => {
        const pct = total > 0 ? (s.value / total) * 100 : 0;
        // A 0.6 gap keeps neighbouring arcs from touching — a slice must not
        // read as part of the one next to it.
        const dash = `${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`;
        const el = (
          <circle
            key={s.key}
            cx={CENTRE}
            cy={CENTRE}
            r={R}
            fill="none"
            strokeWidth={thickness}
            stroke="currentColor"
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            className={`${s.tone} transition-opacity ${s.dimmed ? "opacity-30" : ""} ${s.onClick ? "cursor-pointer hover:opacity-80" : ""}`}
            onClick={s.onClick}
          >
            <title>{`${s.label}: ${s.value}`}</title>
          </circle>
        );
        offset += pct;
        return el;
      })}
      {/* The rotation is undone so the text sits upright. */}
      <g transform={`rotate(90 ${CENTRE} ${CENTRE})`}>
        <text
          x={CENTRE}
          y={CENTRE - 0.5}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white font-body text-[7px] font-light"
        >
          {centreValue}
        </text>
        <text
          x={CENTRE}
          y={CENTRE + 5}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-muted font-body text-[2.6px] font-light uppercase tracking-[0.14em]"
        >
          {centreLabel}
        </text>
      </g>
    </svg>
  );
}

/** One ratio as a ring — a meter, with its number inside. */
export function Ring({
  value,
  total,
  tone,
  centre,
  sub,
  size = "h-20 w-20",
  thickness = 6,
  title,
  onClick,
}: {
  value: number;
  total: number;
  tone: string;
  centre: string;
  sub?: string;
  size?: string;
  thickness?: number;
  title: string;
  onClick?: () => void;
}) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      className={`${size} -rotate-90 ${onClick ? "cursor-pointer" : ""}`}
      role="img"
      aria-label={title}
      onClick={onClick}
    >
      <title>{title}</title>
      <circle cx={CENTRE} cy={CENTRE} r={R} fill="none" strokeWidth={thickness} className="stroke-line-strong/60" />
      {/* Nothing at all draws nothing: a rounded cap on a zero-length arc
          leaves a dot that reads as "a little bit". */}
      {pct > 0 ? (
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={R}
          fill="none"
          strokeWidth={thickness}
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={`${pct} ${100 - pct}`}
          className={tone}
        />
      ) : null}
      <g transform={`rotate(90 ${CENTRE} ${CENTRE})`}>
        <text
          x={CENTRE}
          y={sub ? CENTRE - 1 : CENTRE}
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-white font-body text-[7px] font-light"
        >
          {centre}
        </text>
        {sub ? (
          <text
            x={CENTRE}
            y={CENTRE + 5}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-muted font-body text-[3.4px] font-light uppercase tracking-[0.1em]"
          >
            {sub}
          </text>
        ) : null}
      </g>
    </svg>
  );
}

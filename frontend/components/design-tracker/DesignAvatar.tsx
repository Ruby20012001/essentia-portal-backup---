"use client";

/**
 * A small drawn face beside a designer's name.
 *
 * Monica, 18 Sep: "naam ki jagah koi female clone aaye chota sa naam k sath" —
 * tried on the understanding that it comes straight back out if it does not
 * look right. Everything about it is drawn here in SVG: no photograph of a
 * real person, no image to host, nothing fetched.
 *
 * The same name always draws the same face — the hair, its colour and the
 * shirt come from a hash of the name, so Lavika is recognisably Lavika on
 * every screen. The name is always printed beside it; the face never replaces
 * a name or carries meaning of its own, so it is aria-hidden.
 */

/** A small, stable hash — same name, same face, on every screen and reload. */
function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

const SKIN = ["#E8C39E", "#D9A87C", "#C78B5F", "#F0D2B4"];
const HAIR = ["#2B2118", "#4A2F1B", "#1C1714", "#5A3A22"];
const SHIRT = ["#A8895C", "#3B5BA8", "#2E7D32", "#7A5E38", "#B02020"];

export function DesignAvatar({ name, size = 28 }: { name: string; size?: number }) {
  const h = hash(name);
  const skin = SKIN[h % SKIN.length]!;
  const hair = HAIR[(h >> 3) % HAIR.length]!;
  const shirt = SHIRT[(h >> 6) % SHIRT.length]!;
  // Three ways to wear it: long, a bun, or a bob — so four people are not one face.
  const style = (h >> 9) % 3;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden
      className="shrink-0 rounded-full border border-line-strong bg-surface"
    >
      {/* shoulders */}
      <path d="M6 40c0-7.2 6.3-11 14-11s14 3.8 14 11z" fill={shirt} />
      {/* long hair falls behind the shoulders */}
      {style === 0 ? <path d="M9 22c0-9 4.9-14 11-14s11 5 11 14v9c0 2-1.6 3-3 2.2V19H12v14.2c-1.4.8-3-.2-3-2.2z" fill={hair} /> : null}
      {/* face */}
      <path d="M12 17c0-5 3.6-8.4 8-8.4s8 3.4 8 8.4v3.2c0 5-3.6 8.4-8 8.4s-8-3.4-8-8.4z" fill={skin} />
      {/* hair on top, by style */}
      {style === 1 ? (
        <>
          <path d="M11.4 17.6C11 10.6 14.8 6.4 20 6.4s9 4.2 8.6 11.2c-1.2-3.4-3-5.2-5.2-5.6-2.4-.4-8.6.6-12 5.6z" fill={hair} />
          <circle cx="20" cy="5.4" r="3.2" fill={hair} />
        </>
      ) : style === 2 ? (
        <path d="M11.4 18c-.6-7.4 3.2-11.6 8.6-11.6s9.2 4.2 8.6 11.6c-.6-2-1.4-3.4-2.4-4.4-3 2.2-8.6 2.6-12.4.6-.9.8-1.7 2-2.4 3.8z" fill={hair} />
      ) : (
        <path d="M11.4 18c-.6-7.4 3.2-11.6 8.6-11.6s9.2 4.2 8.6 11.6c-1.2-3.4-3-5.2-5.2-5.6-2.4-.4-8.6.6-12 5.6z" fill={hair} />
      )}
      {/* eyes and a small smile */}
      <circle cx="16.6" cy="18.6" r="1.15" fill="#2B2118" />
      <circle cx="23.4" cy="18.6" r="1.15" fill="#2B2118" />
      <path d="M17.2 23.2c1.6 1.3 4 1.3 5.6 0" stroke="#2B2118" strokeWidth="1.1" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** The face and the name together — the pairing every screen uses. */
export function DesignPersonName({
  name,
  size = 24,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <DesignAvatar name={name} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}

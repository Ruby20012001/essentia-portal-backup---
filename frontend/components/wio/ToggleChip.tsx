"use client";

/** Small stateful chip for checklist/Triangle items — forest when done. */
export function ToggleChip({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      className={`rounded-full border px-2.5 py-0.5 font-body text-[11px] font-bold transition-colors disabled:opacity-50 ${
        checked
          ? "border-forest bg-forest/10 text-forest"
          : "border-line-strong bg-card text-secondary hover:border-white hover:text-white"
      }`}
    >
      {checked ? "✓ " : ""}
      {label}
    </button>
  );
}

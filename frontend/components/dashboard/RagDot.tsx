const RAG_CLASS = {
  green: "bg-forest",
  amber: "bg-amber",
  red: "bg-alert",
} as const;

export function RagDot({ rag }: { rag: keyof typeof RAG_CLASS }) {
  return (
    <span
      aria-label={rag}
      className={`inline-block h-2.5 w-2.5 rounded-full ${RAG_CLASS[rag]}`}
    />
  );
}

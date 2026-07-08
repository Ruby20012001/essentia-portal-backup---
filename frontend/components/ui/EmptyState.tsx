/**
 * Neutral zero-data container used by placeholder routes and empty lists.
 * Brand rules: Cream surfaces, Cormorant headings, Lato 300 body.
 */
export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-label/40 bg-white/50 px-8 py-16 text-center">
      <h2 className="font-heading text-2xl text-espresso">{title}</h2>
      <p className="mt-2 max-w-md font-body text-sm font-light text-label">
        {message}
      </p>
    </div>
  );
}

/**
 * Neutral zero-data container used by placeholder routes and empty lists.
 * Dark theme: card surface, hairline dashed border, Lato throughout.
 */
export function EmptyState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-card px-8 py-16 text-center">
      <h2 className="font-heading text-2xl text-white">{title}</h2>
      <p className="mt-2 max-w-md font-body text-sm font-light text-muted">
        {message}
      </p>
    </div>
  );
}

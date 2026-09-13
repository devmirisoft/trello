import { cn } from "@/lib/utils";

/** Placeholder rows that match the real list's shape, so the page does not
 * reflow when the data lands. Staggered rather than a spinner: a list filling
 * in reads as progress, a spinner reads as a wait. */
export function SkeletonRows({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <ul className={cn("space-y-2", className)} data-testid="skeleton">
      {Array.from({ length: count }, (_, i) => (
        <li
          key={i}
          style={{ "--i": i } as React.CSSProperties}
          className="row-in flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
        >
          <span className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <span className="h-4 flex-1 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  );
}

export function ScreenSkeleton({ title }: { title?: string }) {
  return (
    <main className="safe-top mx-auto w-full max-w-md px-4 pb-24">
      <div className="mb-4 h-7 w-40 animate-pulse rounded bg-muted">
        <span className="sr-only">{title ?? "Loading"}</span>
      </div>
      <SkeletonRows />
    </main>
  );
}

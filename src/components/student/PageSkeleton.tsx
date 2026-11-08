/**
 * Instant placeholder shown in the content area while a dashboard/admin page
 * renders on the server (used by the `loading.tsx` files). The sidebar is part
 * of the layout, so it stays put and interactive; only the content swaps.
 * Next.js also prefetches each sidebar link up to this boundary, so clicking a
 * link paints this immediately instead of waiting for the whole page.
 */
export function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="sa-skeleton h-44 rounded-[1.5rem]" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sa-skeleton h-24 rounded-[1.25rem]" />
        <div className="sa-skeleton h-24 rounded-[1.25rem]" />
        <div className="sa-skeleton h-24 rounded-[1.25rem]" />
      </div>
      <div className="sa-skeleton h-64 rounded-[1.25rem]" />
    </div>
  );
}

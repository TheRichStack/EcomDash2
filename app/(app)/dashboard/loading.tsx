import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardOverviewLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`overview-kpi-${index}`} className="rounded-xl border p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-28" />
            <Skeleton className="mt-4 h-4 w-full" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-4 h-56 w-full rounded-lg" />
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`overview-snapshot-${index}`} className="rounded-xl border p-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-3 h-6 w-24" />
              <Skeleton className="mt-4 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <Skeleton className="mt-4 h-72 w-full rounded-lg" />
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <Skeleton className="mt-4 h-56 w-full rounded-lg" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={`overview-secondary-${index}`} className="rounded-xl border p-4">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="mt-4 h-40 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}

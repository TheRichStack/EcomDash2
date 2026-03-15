import { Skeleton } from "@/components/ui/skeleton"

export default function CreativeLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-full max-w-3xl" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`creative-kpi-${index}`} className="rounded-xl border p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-9 w-28" />
            <Skeleton className="mt-4 h-4 w-full" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={`creative-filter-${index}`}
              className="h-10 w-full rounded-lg"
            />
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-40 rounded-lg" />
            <Skeleton className="h-10 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`creative-card-${index}`} className="overflow-hidden rounded-xl border">
              <Skeleton className="aspect-[4/5] w-full" />
              <div className="space-y-3 p-4">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

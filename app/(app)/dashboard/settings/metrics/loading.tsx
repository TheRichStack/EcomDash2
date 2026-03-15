import { Skeleton } from "@/components/ui/skeleton"

export default function SettingsMetricsLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-32 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>

          <div className="flex flex-col">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={`metric-library-skeleton-${index}`}
                className="flex flex-col gap-3 border-b px-4 py-4 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-7 w-20 rounded-full" />
                </div>
                <Skeleton className="h-4 w-full" />
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-6 w-16 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                  <Skeleton className="h-6 w-24 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="hidden lg:flex lg:flex-col lg:gap-4">
          <div className="rounded-xl border bg-background p-5">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-7 w-32 rounded-full" />
                  <Skeleton className="h-7 w-28 rounded-full" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                </div>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-full" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`metric-detail-tile-${index}`}
                    className="rounded-xl border bg-muted/10 p-3"
                  >
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-3 h-4 w-24" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </div>
                ))}
              </div>

              <div className="rounded-xl border bg-muted/10 p-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-4 w-20" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-4 w-16" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-6 w-24 rounded-full" />
                      <Skeleton className="h-6 w-28 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/10 p-4">
                <Skeleton className="h-4 w-24" />
                <div className="mt-4 flex flex-wrap gap-2">
                  <Skeleton className="h-7 w-28 rounded-full" />
                  <Skeleton className="h-7 w-10 rounded-full" />
                  <Skeleton className="h-7 w-32 rounded-full" />
                </div>
                <Skeleton className="mt-4 h-20 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

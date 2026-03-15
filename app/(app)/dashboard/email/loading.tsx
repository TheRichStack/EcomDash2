import { Skeleton } from "@/components/ui/skeleton"

export default function EmailLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-[28rem] max-w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`email-kpi-skeleton-${index}`}
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-10 w-32" />
            <Skeleton className="mt-4 h-4 w-40" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-48" />
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-6 w-72" />
              <Skeleton className="h-4 w-[34rem] max-w-full" />
            </div>
            <div className="rounded-xl border bg-muted/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Skeleton className="h-10 flex-1" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-[180px]" />
                  <Skeleton className="h-10 w-[170px]" />
                </div>
              </div>
              <Skeleton className="mt-3 h-4 w-64" />
            </div>
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.75fr)_360px]">
              <div className="rounded-xl border bg-background p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="mt-4 h-64 w-full" />
              </div>
              <div className="hidden rounded-xl border bg-background p-4 md:block">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="mt-2 h-4 w-56" />
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton
                      key={`email-detail-skeleton-${index}`}
                      className="h-20 w-full"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

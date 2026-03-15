import { Skeleton } from "@/components/ui/skeleton"

export default function ShopifyProfitLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={`shopify-profit-kpi-${index}`} className="rounded-xl border p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-8 w-28" />
            <Skeleton className="mt-4 h-4 w-full" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`shopify-profit-context-${index}`} className="rounded-xl border p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-6 w-32" />
              <Skeleton className="mt-3 h-4 w-full" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-2 h-4 w-full max-w-xl" />
        <Skeleton className="mt-4 h-72 w-full rounded-lg" />
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-4 h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}

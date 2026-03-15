import { Skeleton } from "@/components/ui/skeleton"

export default function ShopifyProductsLoading() {
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`shopify-products-kpi-${index}`}
            className="rounded-xl border p-4"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-4 h-9 w-32" />
            <Skeleton className="mt-4 h-4 w-full" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border p-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-2 h-4 w-full max-w-2xl" />
        <Skeleton className="mt-4 h-10 w-full rounded-lg" />
        <Skeleton className="mt-4 h-56 w-full rounded-lg" />
      </div>
    </div>
  )
}

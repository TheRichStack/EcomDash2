import { PaidMediaPlatformPage } from "../paid-media-platform-page"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

export default function PaidMediaMetaPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParamsRecord>
}) {
  return <PaidMediaPlatformPage platform="meta" searchParams={searchParams} />
}

import { PaidMediaPlatformPage } from "../paid-media-platform-page"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

export default function PaidMediaTikTokPage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParamsRecord>
}) {
  return <PaidMediaPlatformPage platform="tiktok" searchParams={searchParams} />
}

import { PaidMediaPlatformPage } from "../paid-media-platform-page"

type DashboardSearchParamsRecord = Record<
  string,
  string | string[] | undefined
>

export default function PaidMediaGooglePage({
  searchParams,
}: {
  searchParams?: Promise<DashboardSearchParamsRecord>
}) {
  return <PaidMediaPlatformPage platform="google" searchParams={searchParams} />
}

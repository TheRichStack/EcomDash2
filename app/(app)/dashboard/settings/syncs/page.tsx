import { EmptyState } from "@/components/shared/empty-state"
import { SectionHeader } from "@/components/shared/section-header"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { loadSettingsPageData, type SettingsRoutePageProps } from "../settings-data"
import {
  formatRelativeTime,
  formatSettingsDateTime,
  formatSettingsNumber,
  getFreshnessTone,
  getStatusTone,
  humanizeToken,
  summarizeOperations,
  summarizeSyncSources,
} from "../settings-utils"

export default async function SettingsSyncsPage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const syncSources = summarizeSyncSources(data.syncs.syncState)
  const recentOperations = summarizeOperations(
    data.syncs.recentJobRuns,
    data.syncs.recentBackfillRuns
  ).slice(0, 12)
  const freshSources = syncSources.filter(
    (source) => getFreshnessTone(source.updatedAt) === "secondary"
  )
  const recentJobs = data.syncs.recentJobRuns.slice(0, 5)
  const recentBackfills = data.syncs.recentBackfillRuns.slice(0, 5)

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Syncs"
        title="Connector freshness and recent runs"
        description="A lightweight reporting-adjacent view of sync freshness and operational history. This route stays compact and avoids turning into a heavy admin console."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Sources tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatSettingsNumber(syncSources.length)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Connector sources with at least one sync-state record.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Fresh in 24h</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatSettingsNumber(freshSources.length)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Sources updated in the last day.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Recent jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatSettingsNumber(recentJobs.length)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Job runs included in the recent history window.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Recent backfills</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatSettingsNumber(recentBackfills.length)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Backfill runs included in the recent history window.
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Connector freshness summary
          </h2>
          <p className="text-sm text-muted-foreground">
            Grouped connector status with the latest known state and a compact
            snapshot of the underlying sync-state keys.
          </p>
        </div>

        {syncSources.length === 0 ? (
          <EmptyState
            title="No connector freshness available"
            description="The app-owned sync loader did not return any sync-state rows for this workspace."
          />
        ) : (
          <div className="rounded-xl border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[20%]">Source</TableHead>
                  <TableHead className="w-[18%]">Freshness</TableHead>
                  <TableHead className="w-[18%]">Latest state</TableHead>
                  <TableHead className="w-[28%]">Snapshot</TableHead>
                  <TableHead className="w-[16%]">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncSources.map((source) => (
                  <TableRow key={source.sourceKey}>
                    <TableCell className="font-medium">
                      {humanizeToken(source.sourceKey)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getFreshnessTone(source.updatedAt)}>
                        {formatRelativeTime(source.updatedAt)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusTone(source.statusLabel)}>
                        {source.statusLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      <div className="flex flex-col gap-1">
                        {source.preview.map((entry) => (
                          <span key={`${source.sourceKey}-${entry.label}`}>
                            {entry.label}: {entry.value}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSettingsDateTime(source.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Recent operational history
          </h2>
          <p className="text-sm text-muted-foreground">
            Jobs and backfills are merged into one compact table to keep the
            route reporting-adjacent rather than admin-heavy.
          </p>
        </div>

        {recentOperations.length === 0 ? (
          <EmptyState
            title="No recent sync operations"
            description="No recent jobs or backfills were returned for this workspace."
          />
        ) : (
          <div className="rounded-xl border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[14%]">Type</TableHead>
                  <TableHead className="w-[22%]">Name</TableHead>
                  <TableHead className="w-[14%]">Status</TableHead>
                  <TableHead className="w-[18%]">Started</TableHead>
                  <TableHead className="w-[16%]">Finished</TableHead>
                  <TableHead className="w-[16%]">Message</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOperations.map((operation) => (
                  <TableRow key={`${operation.type}-${operation.id}`}>
                    <TableCell>{operation.type}</TableCell>
                    <TableCell className="font-medium">{operation.name}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusTone(operation.status)}>
                        {operation.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSettingsDateTime(operation.startedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSettingsDateTime(operation.finishedAt)}
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {operation.message}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}

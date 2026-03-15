import Link from "next/link"

import { EmptyState } from "@/components/shared/empty-state"
import { SectionHeader } from "@/components/shared/section-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { buildDashboardHref } from "@/lib/dashboard-state"
import { ROUTES } from "@/lib/constants"

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

export default async function SettingsWorkspacePage({
  searchParams,
}: SettingsRoutePageProps) {
  const data = await loadSettingsPageData(searchParams)
  const configuredTokens = data.workspace.tokens.filter((token) => token.hasValue)
  const syncSources = summarizeSyncSources(data.workspace.syncState)
  const recentOperations = summarizeOperations(
    data.workspace.recentJobRuns,
    data.workspace.recentBackfillRuns
  ).slice(0, 10)
  const freshSources = syncSources.filter(
    (source) => getFreshnessTone(source.updatedAt) === "secondary"
  )

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <SectionHeader
        eyebrow="Workspace"
        title="Integrations and reporting connectivity"
        description="Token presence, connector freshness, and recent operational history stay visible here so workspace-level reporting dependencies remain easy to inspect."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={buildDashboardHref(ROUTES.settingsSyncs, data.context)}>
              View sync route
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Tokens ready</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {configuredTokens.length}/{data.workspace.tokens.length}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Stored connector tokens available to reporting jobs.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Connectors tracked</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatSettingsNumber(syncSources.length)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {freshSources.length} refreshed in the last day.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Recent operations</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tracking-tight">
              {formatSettingsNumber(recentOperations.length)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Jobs and backfills surfaced from the app-owned loader.
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Latest activity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {recentOperations[0]?.name ?? "No recent run"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {recentOperations[0]
                ? formatRelativeTime(recentOperations[0].startedAt)
                : "No recent operational history in this workspace."}
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Integration token presence
          </h2>
          <p className="text-sm text-muted-foreground">
            Read-only visibility into whether each reporting integration has a
            stored credential.
          </p>
        </div>

        {data.workspace.tokens.length === 0 ? (
          <EmptyState
            title="No token records found"
            description="This workspace has not written any integration token state into the shared settings tables yet."
          />
        ) : (
          <div className="rounded-xl border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Integration</TableHead>
                  <TableHead className="w-[20%]">Stored value</TableHead>
                  <TableHead className="w-[40%]">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.workspace.tokens.map((token) => (
                  <TableRow key={token.tokenKey}>
                    <TableCell className="font-medium">
                      {humanizeToken(token.tokenKey)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={token.hasValue ? "secondary" : "destructive"}
                      >
                        {token.hasValue ? "Present" : "Missing"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatSettingsDateTime(token.updatedAt)}
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
            Connector freshness
          </h2>
          <p className="text-sm text-muted-foreground">
            Grouped sync state summary by connector source. This keeps the route
            lightweight while still showing the latest status and a small state
            snapshot.
          </p>
        </div>

        {syncSources.length === 0 ? (
          <EmptyState
            title="No connector sync state yet"
            description="The loader did not return any sync-state rows for this workspace, so freshness is not available yet."
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
            A compact cross-source history of jobs and backfills so data
            freshness can be explained without turning Settings into an admin
            console.
          </p>
        </div>

        {recentOperations.length === 0 ? (
          <EmptyState
            title="No recent operations"
            description="No jobs or backfills were returned for this workspace in the recent history window."
          />
        ) : (
          <div className="rounded-xl border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[14%]">Type</TableHead>
                  <TableHead className="w-[20%]">Name</TableHead>
                  <TableHead className="w-[14%]">Status</TableHead>
                  <TableHead className="w-[18%]">Started</TableHead>
                  <TableHead className="w-[18%]">Finished</TableHead>
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

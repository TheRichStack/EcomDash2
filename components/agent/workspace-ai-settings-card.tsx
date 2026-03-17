"use client"

import { useEffect, useMemo, useState, useTransition } from "react"

import { saveAgentWorkspaceSettingsAction } from "@/app/(app)/dashboard/settings/agent-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type {
  AgentModelOption,
  AgentProvider,
  AgentWorkspaceSettings,
} from "@/lib/agent/types"

type WorkspaceAiSettingsCardProps = {
  initialHasAnthropicKey: boolean
  initialHasOpenAiKey: boolean
  initialBusinessProfile: string
  initialModel: string
  initialProvider: AgentProvider | null
  onSaved?: (state: AgentWorkspaceSettings) => void
  updatedAt: string | null
  workspaceId: string
}

const PROVIDER_OPTIONS: Array<{
  label: string
  value: AgentProvider
}> = [
  { label: "OpenAI", value: "openai" },
  { label: "Anthropic", value: "anthropic" },
]

export function WorkspaceAiSettingsCard(props: WorkspaceAiSettingsCardProps) {
  const [hasStoredKeyByProvider, setHasStoredKeyByProvider] = useState({
    anthropic: props.initialHasAnthropicKey,
    openai: props.initialHasOpenAiKey,
  })
  const [provider, setProvider] = useState<AgentProvider>(
    props.initialProvider ?? "openai"
  )
  const [apiKey, setApiKey] = useState("")
  const [businessProfile, setBusinessProfile] = useState(
    props.initialBusinessProfile || ""
  )
  const [model, setModel] = useState(props.initialModel || "auto")
  const [models, setModels] = useState<AgentModelOption[]>([])
  const [verifyMessage, setVerifyMessage] = useState("")
  const [saveMessage, setSaveMessage] = useState("")
  const [isVerifying, startVerify] = useTransition()
  const [isSaving, startSave] = useTransition()

  const providerHasSavedKey = hasStoredKeyByProvider[provider]
  const modelOptions = useMemo(
    () => [{ id: "auto", label: "Auto" }, ...models],
    [models]
  )

  useEffect(() => {
    if (!providerHasSavedKey) {
      return
    }

    startVerify(async () => {
      try {
        const response = await fetch("/api/agent/models", {
          body: JSON.stringify({
            provider,
            workspaceId: props.workspaceId,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
        })
        const payload = (await response.json()) as {
          message?: string
          models?: AgentModelOption[]
          verified?: boolean
        }

        if (!response.ok) {
          setModels([])
          setVerifyMessage(payload.message ?? "Unable to load models.")
          return
        }

        setModels(Array.isArray(payload.models) ? payload.models : [])
        setVerifyMessage(
          payload.verified
            ? `Verified ${provider} credentials and loaded ${payload.models?.length ?? 0} model options.`
            : "Models loaded."
        )
      } catch (error) {
        setModels([])
        setVerifyMessage(
          error instanceof Error ? error.message : "Unable to load models."
        )
      }
    })
  }, [provider, providerHasSavedKey, props.workspaceId])

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>AI provider</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paste a BYOK provider key, verify it server-side, and save a default
              model for the dashboard agent.
            </p>
          </div>
          <Badge variant={providerHasSavedKey ? "secondary" : "outline"}>
            {providerHasSavedKey ? "Key stored" : "Setup needed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Provider</span>
            <Select
              value={provider}
              onValueChange={(next) => {
                const nextProvider = next as AgentProvider
                setProvider(nextProvider)

                if (!hasStoredKeyByProvider[nextProvider]) {
                  setModels([])
                  setVerifyMessage("")
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PROVIDER_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Model</span>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {modelOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              Only recommended analysis models are shown here.
            </span>
          </label>
        </div>

        <label className="grid gap-2 text-sm">
          <span className="font-medium">API key</span>
          <Input
            placeholder={
              providerHasSavedKey
                ? "Leave blank to keep the stored key"
                : `Paste a ${provider} API key`
            }
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-medium">Business brief</span>
          <Textarea
            className="min-h-[150px]"
            placeholder="Optional. Describe what this business sells, its primary channels, important KPI caveats, seasonality, margin realities, and anything the agent should know before analysing this workspace."
            value={businessProfile}
            onChange={(event) => setBusinessProfile(event.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            Optional and workspace-specific. Use this for stable business context,
            not live performance updates.
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              startVerify(async () => {
                setVerifyMessage("")
                try {
                  const response = await fetch("/api/agent/models", {
                    body: JSON.stringify({
                      candidateApiKey: apiKey,
                      provider,
                      workspaceId: props.workspaceId,
                    }),
                    headers: {
                      "Content-Type": "application/json",
                    },
                    method: "POST",
                  })
                  const payload = (await response.json()) as {
                    message?: string
                    models?: AgentModelOption[]
                    verified?: boolean
                  }

                  if (!response.ok) {
                    setModels([])
                    setVerifyMessage(payload.message ?? "Unable to verify the key.")
                    return
                  }

                  setModels(Array.isArray(payload.models) ? payload.models : [])
                  setVerifyMessage(
                    payload.verified
                      ? `Verified ${provider} credentials and loaded ${payload.models?.length ?? 0} model options.`
                      : "Models loaded."
                  )
                } catch (error) {
                  setModels([])
                  setVerifyMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to verify the key."
                  )
                }
              })
            }
          >
            {isVerifying ? "Verifying..." : "Verify key"}
          </Button>

          <Button
            onClick={() =>
              startSave(async () => {
                setSaveMessage("")
                const result = await saveAgentWorkspaceSettingsAction({
                  apiKey,
                  businessProfile,
                  model,
                  provider,
                  workspaceId: props.workspaceId,
                })

                if (result.status === "error") {
                  setSaveMessage(result.message)
                  return
                }

                setApiKey("")
                setBusinessProfile(result.state.businessProfile)
                setModel(result.state.model)
                setHasStoredKeyByProvider(result.state.hasKeyByProvider)
                setSaveMessage("Agent settings saved.")
                props.onSaved?.(result.state)
              })
            }
          >
            {isSaving ? "Saving..." : "Save AI settings"}
          </Button>
        </div>

        <div className="grid gap-1 text-sm text-muted-foreground">
          {verifyMessage ? <p>{verifyMessage}</p> : null}
          {saveMessage ? <p>{saveMessage}</p> : null}
          <p>
            Stored keys never leave the server. Saved on:{" "}
            {props.updatedAt ? new Date(props.updatedAt).toLocaleString() : "Not yet saved"}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

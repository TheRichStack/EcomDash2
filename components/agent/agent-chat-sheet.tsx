"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BotIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
  PlusIcon,
  SparklesIcon,
  Trash2Icon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { AgentInlineCharts } from "@/components/agent/agent-inline-charts"
import { WorkspaceAiSettingsCard } from "@/components/agent/workspace-ai-settings-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useDashboardState } from "@/hooks/use-dashboard-state"
import type {
  AgentChartSpec,
  AgentPresetId,
  AgentPresetListItem,
  AgentProvider,
  AgentStorageConversation,
  AgentUsageSummary,
  AgentWorkspaceSettings,
} from "@/lib/agent/types"
import { cn } from "@/lib/utils"

type AgentUiMessage = {
  content: string
  createdAt: string
  id: string
  metadata: {
    charts?: AgentChartSpec[]
    executionMode?: "direct" | "tools" | "worker"
    clarifyingOptions?: Array<{
      label?: string
      message?: string
    }>
    dateClarificationQuestion?: string
    requestedOps?: string[]
    usage?: AgentUsageSummary
    usedTools?: Array<{
      label?: string
      name?: string
      summary?: string
    }>
    warnings?: string[]
  }
  role: "user" | "assistant" | "system"
}

type AgentSetupState = {
  businessProfile: string
  hasKeyByProvider: Record<AgentProvider, boolean>
  isConfigured: boolean
  model: string
  provider: AgentProvider | null
  updatedAt: string | null
}

type AgentChatPayload = {
  conversation: AgentStorageConversation | null
  messages: AgentUiMessage[]
  setup?: {
    businessProfile?: string
    hasKeyByProvider: Record<AgentProvider, boolean>
    isConfigured: boolean
    model: string
    provider: AgentProvider | null
    updatedAt: string | null
  }
}

function storageKey(workspaceId: string) {
  return `ecomdash2.agent.conversation.${workspaceId}`
}

function formatTokenCount(value: number) {
  return new Intl.NumberFormat("en-GB").format(Math.round(value))
}

function formatUsd(value: number) {
  if (value < 0.01) {
    return `$${value.toFixed(4)}`
  }

  return `$${value.toFixed(2)}`
}

function formatConversationStamp(value: string) {
  if (!value) {
    return ""
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return ""
  }

  return parsed.toLocaleString("en-GB", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  })
}

function hydrateSetup(
  setup: AgentChatPayload["setup"] | null | undefined
): AgentSetupState | null {
  if (!setup) {
    return null
  }

  return {
    businessProfile: String(setup.businessProfile ?? ""),
    hasKeyByProvider: setup.hasKeyByProvider,
    isConfigured: Boolean(setup.isConfigured),
    model: String(setup.model ?? "auto"),
    provider:
      setup.provider === "openai" || setup.provider === "anthropic"
        ? setup.provider
        : null,
    updatedAt: typeof setup.updatedAt === "string" ? setup.updatedAt : null,
  }
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="grid gap-2 text-sm leading-6">
      <ReactMarkdown
        components={{
          h1: ({ children }) => <h1 className="text-base font-semibold">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-semibold">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold">{children}</h3>,
          p: ({ children }) => <p className="text-sm leading-6">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
          li: ({ children }) => <li className="my-0.5">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          code: ({ children, className }) => (
            <code
              className={cn(
                "rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]",
                className
              )}
            >
              {children}
            </code>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { message?: string }

  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed.")
  }

  return payload
}

export function AgentChatSheet() {
  const { requestContext } = useDashboardState()
  const messageEndRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"chat" | "runbooks" | "settings">(
    "chat"
  )
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations, setConversations] = useState<AgentStorageConversation[]>(
    []
  )
  const [messages, setMessages] = useState<AgentUiMessage[]>([])
  const [draft, setDraft] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isConversationLoading, setIsConversationLoading] = useState(false)
  const [isConversationBusy, setIsConversationBusy] = useState(false)
  const [error, setError] = useState("")
  const [setup, setSetup] = useState<AgentSetupState | null>(null)
  const [isRenameMode, setIsRenameMode] = useState(false)
  const [renameDraft, setRenameDraft] = useState("")
  const [runbooks, setRunbooks] = useState<AgentPresetListItem[]>([])

  const workspaceStorageKey = useMemo(
    () => storageKey(requestContext.workspaceId),
    [requestContext.workspaceId]
  )
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversationId, conversations]
  )
  const conversationUsage = useMemo(() => {
    return messages.reduce(
      (summary, message) => {
        const usage = message.metadata.usage

        if (!usage) {
          return summary
        }

        summary.inputTokens += Number(usage.inputTokens ?? 0)
        summary.outputTokens += Number(usage.outputTokens ?? 0)
        summary.totalTokens += Number(usage.totalTokens ?? 0)
        summary.estimatedCostUsd += Number(usage.estimatedCostUsd ?? 0)
        return summary
      },
      {
        estimatedCostUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      }
    )
  }, [messages])

  function selectConversation(nextConversationId: string | null) {
    setActiveTab("chat")
    setError("")
    setMessages([])
    persistConversationId(nextConversationId)
  }

  const persistConversationId = useCallback(
    (nextConversationId: string | null) => {
      setConversationId(nextConversationId)

      if (!nextConversationId) {
        window.localStorage.removeItem(workspaceStorageKey)
        return
      }

      window.localStorage.setItem(workspaceStorageKey, nextConversationId)
    },
    [workspaceStorageKey]
  )

  const refreshConversations = useCallback(async () => {
    const response = await fetch(
      `/api/agent/conversations?workspaceId=${encodeURIComponent(requestContext.workspaceId)}`,
      {
        cache: "no-store",
      }
    )
    const payload = await parseJsonResponse<{
      conversations: AgentStorageConversation[]
    }>(response)
    const nextConversations = Array.isArray(payload.conversations)
      ? payload.conversations
      : []

    setConversations(nextConversations)
    return nextConversations
  }, [requestContext.workspaceId])

  const refreshRunbooks = useCallback(async () => {
    const response = await fetch("/api/agent/presets", {
      cache: "no-store",
    })
    const payload = await parseJsonResponse<{
      presets: AgentPresetListItem[]
    }>(response)
    const nextRunbooks = Array.isArray(payload.presets) ? payload.presets : []

    setRunbooks(nextRunbooks)
    return nextRunbooks
  }, [])

  useEffect(() => {
    const storedConversationId = window.localStorage.getItem(workspaceStorageKey)

    if (storedConversationId) {
      setConversationId(storedConversationId)
    } else {
      setConversationId(null)
    }
  }, [workspaceStorageKey])

  useEffect(() => {
    if (!open) {
      return
    }

    let cancelled = false

    async function load() {
      setIsConversationLoading(true)
      setError("")

      try {
        const params = new URLSearchParams({
          workspaceId: requestContext.workspaceId,
        })

        if (conversationId) {
          params.set("conversationId", conversationId)
        }

        const [conversationList, , chatPayload] = await Promise.all([
          refreshConversations(),
          refreshRunbooks(),
          fetch(`/api/agent/chat?${params.toString()}`, {
            cache: "no-store",
          }).then((response) => parseJsonResponse<AgentChatPayload>(response)),
        ])

        if (cancelled) {
          return
        }

        const nextConversationId = String(chatPayload.conversation?.id ?? "").trim()
        setSetup(hydrateSetup(chatPayload.setup))
        setMessages(Array.isArray(chatPayload.messages) ? chatPayload.messages : [])

        if (nextConversationId) {
          persistConversationId(nextConversationId)
        } else if (
          conversationList.length > 0 &&
          !conversationList.some((conversation) => conversation.id === conversationId)
        ) {
          persistConversationId(conversationList[0].id)
        } else if (conversationList.length === 0) {
          persistConversationId(null)
          setMessages([])
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof Error
              ? nextError.message
              : "Unable to load the agent chat."
          )
        }
      } finally {
        if (!cancelled) {
          setIsConversationLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [
    conversationId,
    open,
    persistConversationId,
    refreshConversations,
    refreshRunbooks,
    requestContext.workspaceId,
  ])

  useEffect(() => {
    if (!open || !setup) {
      return
    }

    if (!setup.isConfigured) {
      setActiveTab("settings")
    }
  }, [open, setup])

  useEffect(() => {
    setIsRenameMode(false)
    setRenameDraft(selectedConversation?.title ?? "")
  }, [selectedConversation?.id, selectedConversation?.title])

  useEffect(() => {
    if (!open) {
      return
    }

    messageEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    })
  }, [isLoading, messages, open])

  async function createConversation(title = "New chat") {
    setIsConversationBusy(true)
    setError("")

    try {
      const response = await fetch("/api/agent/conversations", {
        body: JSON.stringify({
          title,
          workspaceId: requestContext.workspaceId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })
      const payload = await parseJsonResponse<{
        conversation: AgentStorageConversation
      }>(response)

      setMessages([])
      setDraft("")
      selectConversation(payload.conversation.id)
      await refreshConversations()
      return payload.conversation
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to create a new chat."
      )
      return null
    } finally {
      setIsConversationBusy(false)
    }
  }

  async function renameConversation() {
    if (!selectedConversation) {
      return
    }

    const trimmed = renameDraft.trim()

    if (!trimmed) {
      setError("Conversation title cannot be empty.")
      return
    }

    setIsConversationBusy(true)
    setError("")

    try {
      const response = await fetch(
        `/api/agent/conversations/${encodeURIComponent(selectedConversation.id)}`,
        {
          body: JSON.stringify({
            title: trimmed,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "PATCH",
        }
      )
      await parseJsonResponse<{ conversation: AgentStorageConversation }>(response)
      await refreshConversations()
      setIsRenameMode(false)
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to rename this chat."
      )
    } finally {
      setIsConversationBusy(false)
    }
  }

  async function deleteConversation(targetConversation?: AgentStorageConversation | null) {
    if (!targetConversation) {
      return
    }

    const label = targetConversation.title || "Untitled chat"

    if (
      !window.confirm(
        `Delete "${label}"?\n\nThis removes the full shared chat history for this conversation.`
      )
    ) {
      return
    }

    setIsConversationBusy(true)
    setError("")

    try {
      const response = await fetch(
        `/api/agent/conversations/${encodeURIComponent(targetConversation.id)}`,
        {
          method: "DELETE",
        }
      )
      await parseJsonResponse<{ ok: boolean }>(response)
      const nextConversations = await refreshConversations()

      if (targetConversation.id === conversationId) {
        setMessages([])
        setDraft("")
        selectConversation(nextConversations[0]?.id ?? null)
      }
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to delete this chat."
      )
    } finally {
      setIsConversationBusy(false)
    }
  }

  async function sendMessage(
    message: string,
    confirmedOps?: string[],
    options?: {
      conversationIdOverride?: string | null
      forceNewConversation?: boolean
      presetId?: AgentPresetId
    }
  ) {
    if (setup && !setup.isConfigured) {
      setError("Add an AI provider key in Settings before starting a conversation.")
      return
    }

    const trimmed = message.trim()

    if (!trimmed) {
      return
    }

    const targetConversationId =
      options?.conversationIdOverride ?? conversationId ?? null
    const optimisticMessage: AgentUiMessage = {
      content: trimmed,
      createdAt: new Date().toISOString(),
      id: `local-${Date.now()}`,
      metadata: {},
      role: "user",
    }

    if (
      options?.forceNewConversation ||
      (options?.conversationIdOverride &&
        options.conversationIdOverride !== conversationId)
    ) {
      setMessages([optimisticMessage])
    } else {
      setMessages((current) => [...current, optimisticMessage])
    }

    setDraft("")
    setError("")
    setIsLoading(true)
    setActiveTab("chat")

    try {
      const requestBody: {
        confirmedOps?: string[]
        context: {
          compare: typeof requestContext.compare
          from: string
          to: string
          workspaceId: string
        }
        conversationId: string | null
        forceNewConversation: boolean
        message: string
        presetId?: AgentPresetId
      } = {
        context: {
          compare: requestContext.compare,
          from: requestContext.from,
          to: requestContext.to,
          workspaceId: requestContext.workspaceId,
        },
        conversationId: targetConversationId,
        forceNewConversation: Boolean(options?.forceNewConversation),
        message: trimmed,
        presetId: options?.presetId,
      }

      if (Array.isArray(confirmedOps)) {
        requestBody.confirmedOps = confirmedOps
      }

      const response = await fetch("/api/agent/chat", {
        body: JSON.stringify(requestBody),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      })

      if (!response.ok || !response.body) {
        throw new Error("Unable to start the agent run.")
      }

      const decoder = new TextDecoder()
      const reader = response.body.getReader()
      let buffer = ""

      while (true) {
        const chunk = await reader.read()

        if (chunk.done) {
          break
        }

        buffer += decoder.decode(chunk.value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          const trimmedLine = line.trim()

          if (!trimmedLine) {
            continue
          }

          const event = JSON.parse(trimmedLine) as Record<string, unknown>

          if (event.type === "error") {
            setError(String(event.message ?? "Agent error"))
          }

          if (event.type === "message") {
            const nextConversationId = String(event.conversationId ?? "").trim()

            if (nextConversationId) {
              persistConversationId(nextConversationId)
            }

            setMessages((current) => [...current, event.message as AgentUiMessage])
          }
        }
      }

      await refreshConversations()
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : "Agent request failed."
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function handleRunbook(presetId: AgentPresetId) {
    const preset = runbooks.find((entry) => entry.id === presetId)

    if (!preset) {
      return
    }

    const conversation = await createConversation(preset.titleSeed)

    if (!conversation) {
      return
    }

    await sendMessage(preset.defaultMessage, [], {
      conversationIdOverride: conversation.id,
      presetId,
    })
  }

  function handleSetupSaved(nextState: AgentWorkspaceSettings) {
    setSetup({
      businessProfile: nextState.businessProfile,
      hasKeyByProvider: nextState.hasKeyByProvider,
      isConfigured:
        Boolean(nextState.provider) &&
        nextState.hasKeyByProvider[nextState.provider ?? "openai"],
      model: nextState.model,
      provider: nextState.provider,
      updatedAt: nextState.updatedAt,
    })
    setActiveTab("chat")
    setError("")
  }

  return (
    <>
      <Button
        className="gap-2"
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
      >
        <SparklesIcon className="size-4" />
        Ask AI
      </Button>

      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent
          className="flex h-full w-full min-h-0 flex-col gap-0 overflow-hidden p-0"
          showCloseButton={false}
          style={{ width: "82vw", maxWidth: "82vw" }}
        >
          {/* Hidden accessible title */}
          <SheetTitle className="sr-only">Agentic Brain</SheetTitle>

          <div className="flex h-full min-h-0">
            {/* ── LEFT SIDEBAR (desktop) ─────────────────────────────── */}
            <aside className="hidden md:flex w-[220px] shrink-0 flex-col overflow-x-hidden border-r bg-muted/10">
              {/* Sidebar header */}
              <div className="flex items-center gap-2.5 border-b px-4 py-3.5">
                <SparklesIcon className="size-4 shrink-0 text-primary" />
                <span className="text-sm font-semibold">Agentic Brain</span>
              </div>

              {/* New chat */}
              <div className="border-b px-3 py-2.5">
                <Button
                  className="w-full justify-start gap-2"
                  disabled={isConversationBusy}
                  onClick={() => void createConversation()}
                  size="sm"
                  variant="outline"
                >
                  <PlusIcon className="size-3.5" />
                  New chat
                </Button>
              </div>

              {/* Conversation list */}
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="grid gap-0.5 p-2">
                  {conversations.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                      No chats yet.
                      <br />
                      Start a new thread.
                    </p>
                  ) : null}

                  {conversations.map((conversation) =>
                    isRenameMode && conversation.id === conversationId ? (
                      <div
                        className="flex items-center gap-1 p-1"
                        key={conversation.id}
                      >
                        <Input
                          autoFocus
                          className="h-7 min-w-0 flex-1 text-xs"
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void renameConversation()
                            if (e.key === "Escape") {
                              setIsRenameMode(false)
                              setRenameDraft(selectedConversation?.title ?? "")
                            }
                          }}
                          value={renameDraft}
                        />
                        <Button
                          className="h-7 shrink-0 px-2 text-xs"
                          disabled={isConversationBusy}
                          onClick={() => void renameConversation()}
                          size="sm"
                        >
                          Save
                        </Button>
                        <Button
                          className="h-7 px-2"
                          onClick={() => {
                            setIsRenameMode(false)
                            setRenameDraft(selectedConversation?.title ?? "")
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="group relative" key={conversation.id}>
                        <button
                          className={cn(
                            "w-full rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                            conversation.id === conversationId
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                          )}
                          onClick={() => selectConversation(conversation.id)}
                          type="button"
                        >
                          <span className="block line-clamp-2 font-medium leading-snug">
                            {conversation.title || "Untitled chat"}
                          </span>
                          {conversation.summaryText ? (
                            <p className="mt-0.5 line-clamp-2 text-[11px] opacity-60">
                              {conversation.summaryText}
                            </p>
                          ) : null}
                          <p className="mt-1 text-[11px] opacity-40">
                            {formatConversationStamp(conversation.updatedAt)}
                          </p>
                        </button>
                        <div className="absolute right-1.5 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          {conversation.id === conversationId ? (
                            <button
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                              onClick={() => setIsRenameMode(true)}
                              type="button"
                            >
                              <PencilLineIcon className="size-3" />
                              <span className="sr-only">Rename chat</span>
                            </button>
                          ) : null}
                          <button
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              void deleteConversation(conversation)
                            }}
                            type="button"
                          >
                            <Trash2Icon className="size-3" />
                            <span className="sr-only">Delete chat</span>
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </aside>

            {/* ── MAIN PANEL ──────────────────────────────────────────── */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <Tabs
                className="flex min-h-0 flex-1 flex-col"
                onValueChange={(value) =>
                  setActiveTab(value as "chat" | "runbooks" | "settings")
                }
                value={activeTab}
              >
                {/* Panel top bar */}
                <div className="flex items-center justify-between gap-3 border-b px-4 py-2 pr-14">
                  {/* Mobile: title + conversation picker */}
                  <div className="flex min-w-0 items-center gap-2 md:hidden">
                    <span className="shrink-0 text-sm font-semibold">
                      Agentic Brain
                    </span>
                    <Button
                      className="shrink-0 gap-1.5"
                      disabled={isConversationBusy}
                      onClick={() => void createConversation()}
                      size="sm"
                      variant="outline"
                    >
                      <PlusIcon className="size-3.5" />
                      New
                    </Button>
                    <Select
                      onValueChange={(value) => selectConversation(value)}
                      value={conversationId ?? ""}
                    >
                      <SelectTrigger className="h-8 min-w-0 flex-1 text-xs">
                        <SelectValue placeholder="Select a chat" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {conversations.map((conversation) => (
                            <SelectItem
                              key={conversation.id}
                              value={conversation.id}
                            >
                              {conversation.title || "Untitled chat"}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desktop: active conversation label */}
                  <div className="hidden min-w-0 items-center md:flex">
                    <span className="truncate text-sm text-muted-foreground">
                      {selectedConversation?.title ?? "No chat selected"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedConversation ? (
                      <Button
                        className="shrink-0"
                        disabled={isConversationBusy}
                        onClick={() => void deleteConversation(selectedConversation)}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Trash2Icon className="size-4" />
                        <span className="sr-only">Delete selected chat</span>
                      </Button>
                    ) : null}

                    <TabsList className="h-8 shrink-0">
                      <TabsTrigger className="px-3 text-xs" value="chat">
                        Chat
                      </TabsTrigger>
                      <TabsTrigger className="px-3 text-xs" value="runbooks">
                        Runbooks
                      </TabsTrigger>
                      <TabsTrigger className="px-3 text-xs" value="settings">
                        Settings
                      </TabsTrigger>
                    </TabsList>
                  </div>
                </div>

                {/* ── CHAT TAB ──────────────────────────────────────── */}
                <TabsContent
                  className="mt-0 flex min-h-0 flex-1 flex-col border-0 data-[state=inactive]:hidden"
                  value="chat"
                >
                  {/* Inline banners */}
                  {setup && !setup.isConfigured ? (
                    <div className="mx-4 mt-3 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                      Add an OpenAI or Anthropic API key in{" "}
                      <button
                        className="underline underline-offset-2"
                        onClick={() => setActiveTab("settings")}
                        type="button"
                      >
                        Settings
                      </button>{" "}
                      before starting a conversation.
                    </div>
                  ) : null}

                  {error ? (
                    <div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                      {error}
                    </div>
                  ) : null}

                  {/* Messages */}
                  <div className="min-h-0 flex-1 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="flex flex-col gap-4 p-4 pb-2">
                        {messages.length === 0 && !isLoading && !isConversationLoading ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="mb-4 rounded-full border bg-muted/40 p-3">
                              <SparklesIcon className="size-5 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium">Ask about your business</p>
                            <p className="mt-1.5 max-w-[300px] text-xs text-muted-foreground">
                              Free-form questions, shared threads, or use a Runbook for a trusted preset.
                            </p>
                          </div>
                        ) : null}

                        {messages.map((message) => (
                          <div
                            className={cn(
                              "flex flex-col gap-1.5",
                              message.role === "user" ? "items-end" : "items-start"
                            )}
                            key={message.id}
                          >
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              {message.role === "assistant" ? (
                                <BotIcon className="size-3.5" />
                              ) : (
                                <MessageSquareTextIcon className="size-3.5" />
                              )}
                              <span>
                                {message.role === "assistant" ? "Agent" : "You"}
                              </span>
                              {message.metadata.executionMode ? (
                                <Badge
                                  className="px-1.5 py-0 text-[10px]"
                                  variant="outline"
                                >
                                  {message.metadata.executionMode}
                                </Badge>
                              ) : null}
                            </div>

                            <div
                              className={cn(
                                "max-w-[88%] rounded-2xl px-4 py-3 text-sm",
                                message.role === "user"
                                  ? "bg-primary text-primary-foreground"
                                  : "border bg-muted/20"
                              )}
                            >
                              {message.role === "assistant" ? (
                                <>
                                  <MarkdownMessage content={message.content} />
                                  {Array.isArray(message.metadata.charts) &&
                                  message.metadata.charts.length > 0 ? (
                                    <AgentInlineCharts charts={message.metadata.charts} />
                                  ) : null}
                                </>
                              ) : (
                                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                  {message.content}
                                </div>
                              )}

                              {message.role === "assistant" &&
                              Array.isArray(message.metadata.clarifyingOptions) &&
                              message.metadata.clarifyingOptions.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {message.metadata.clarifyingOptions.map((option) => {
                                    const label = String(option.label ?? "").trim()
                                    const reply = String(option.message ?? "").trim()

                                    if (!label || !reply) {
                                      return null
                                    }

                                    return (
                                      <Button
                                        key={label}
                                        onClick={() => {
                                          void sendMessage(reply)
                                        }}
                                        size="sm"
                                        variant="outline"
                                      >
                                        {label}
                                      </Button>
                                    )
                                  })}
                                </div>
                              ) : null}

                          {message.role === "assistant" &&
                          Array.isArray(message.metadata.usedTools) &&
                          message.metadata.usedTools.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {message.metadata.usedTools.map((tool) => (
                                    <Badge
                                      key={tool.name ?? tool.label}
                                      variant="secondary"
                                    >
                                      <WrenchIcon className="size-3" />
                                      {tool.label ?? tool.name}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}

                              {message.role === "assistant" &&
                              Array.isArray(message.metadata.requestedOps) &&
                              message.metadata.requestedOps.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {message.metadata.requestedOps.map((op) => (
                                    <Button
                                      key={op}
                                      onClick={() => {
                                        void sendMessage(
                                          `Confirm and run ${op}.`,
                                          [String(op)]
                                        )
                                      }}
                                      size="sm"
                                      variant="outline"
                                    >
                                      Confirm {op}
                                    </Button>
                                  ))}
                                </div>
                              ) : null}

                              {message.role === "assistant" &&
                              Array.isArray(message.metadata.warnings) &&
                              message.metadata.warnings.length > 0 ? (
                                <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                                  {message.metadata.warnings.map((warning) => (
                                    <p key={warning}>{warning}</p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ))}

                        {isConversationLoading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <LoaderCircleIcon className="size-4 animate-spin" />
                            Loading chat history...
                          </div>
                        ) : null}

                        {isLoading ? (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <BotIcon className="size-3.5" />
                              <span>Agent</span>
                            </div>
                            <div className="flex w-fit items-center gap-2.5 rounded-2xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                              <LoaderCircleIcon className="size-3.5 animate-spin" />
                              Thinking...
                            </div>
                          </div>
                        ) : null}

                        <div ref={messageEndRef} />
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Input footer */}
                  <div className="shrink-0 border-t bg-background px-4 py-3">
                    <Textarea
                      className="min-h-[80px] resize-none border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                      disabled={isLoading || (setup ? !setup.isConfigured : false)}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault()
                          void sendMessage(draft)
                        }
                      }}
                      placeholder="Ask about performance, diagnostics, inventory, products, or sync health..."
                      value={draft}
                    />
                    <div className="flex items-center justify-between pt-2">
                      <div className="grid gap-0.5 text-[11px] text-muted-foreground">
                        <span>
                          {formatTokenCount(conversationUsage.inputTokens)} in /{" "}
                          {formatTokenCount(conversationUsage.outputTokens)} out / est{" "}
                          {formatUsd(conversationUsage.estimatedCostUsd)}
                          {setup?.model && setup.model !== "auto" ? (
                            <span className="ml-2 opacity-60">· {setup.model}</span>
                          ) : setup?.provider ? (
                            <span className="ml-2 opacity-60">· {setup.provider} auto</span>
                          ) : null}
                        </span>
                        <span className="opacity-60">
                          Scope: infers likely date scope and states assumptions · ⏎ send · ⇧⏎ newline
                        </span>
                      </div>
                      <Button
                        className="shrink-0"
                        disabled={isLoading || (setup ? !setup.isConfigured : false)}
                        onClick={() => void sendMessage(draft)}
                        size="sm"
                      >
                        Send
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                {/* ── RUNBOOKS TAB ──────────────────────────────────── */}
                <TabsContent
                  className="mt-0 min-h-0 flex-1 overflow-y-auto border-0 p-4"
                  value="runbooks"
                >
                  <div className="grid gap-4">
                    <p className="text-sm text-muted-foreground">
                      Runbooks start a new shared chat with a fixed scope and a
                      trusted tool bundle.
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {runbooks.map((preset) => (
                        <button
                          className="group rounded-xl border bg-background px-4 py-4 text-left transition-colors hover:bg-muted/50"
                          key={preset.id}
                          onClick={() => void handleRunbook(preset.id)}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-medium">
                              {preset.label}
                            </div>
                            <SparklesIcon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {preset.description}
                          </p>
                          <div className="mt-4">
                            <Badge variant="secondary">Starts a new chat</Badge>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                {/* ── SETTINGS TAB ──────────────────────────────────── */}
                <TabsContent
                  className="mt-0 min-h-0 flex-1 overflow-y-auto border-0 p-4"
                  value="settings"
                >
                  <div className="grid gap-4">
                    <p className="text-sm text-muted-foreground">
                      Update the provider, swap the stored API key, or change the
                      default model for this workspace.
                    </p>
                    {setup ? (
                      <WorkspaceAiSettingsCard
                        initialHasAnthropicKey={setup.hasKeyByProvider.anthropic}
                        initialBusinessProfile={setup.businessProfile}
                        initialHasOpenAiKey={setup.hasKeyByProvider.openai}
                        initialModel={setup.model}
                        initialProvider={setup.provider}
                        onSaved={handleSetupSaved}
                        updatedAt={setup.updatedAt}
                        workspaceId={requestContext.workspaceId}
                      />
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>

          {/* Close button — absolute over both panels */}
          <SheetClose asChild>
            <Button
              className="absolute right-3 top-3 z-10"
              size="icon-sm"
              variant="ghost"
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </Button>
          </SheetClose>
        </SheetContent>
      </Sheet>
    </>
  )
}

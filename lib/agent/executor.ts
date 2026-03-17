import "server-only"

import vm from "node:vm"

import { env } from "@/lib/env"
import { runAgentDatasetBroker, runAgentOpsBroker, runAgentSqlBroker } from "@/lib/agent/broker"
import type {
  AgentExecutorRequest,
  AgentExecutorResult,
} from "@/lib/agent/types"
import { signRequestBody } from "@/lib/agent/utils"

const EXECUTION_TIMEOUT_MS = 20_000
type AgentExecutorInput = Omit<AgentExecutorRequest, "allowedOps"> & {
  allowedOps?: string[]
}

function buildHelpers() {
  return {
    compact(items: unknown[], limit = 10) {
      return Array.isArray(items) ? items.slice(0, limit) : []
    },
    sum(values: unknown[]) {
      return Array.isArray(values)
        ? values.reduce<number>((sum, value) => sum + Number(value || 0), 0)
        : 0
    },
  }
}

async function executeScriptBody(input: {
  context: AgentExecutorRequest["context"]
  question: string
  scriptBody: string
  broker: {
    getDataset: (name: string) => Promise<unknown>
    querySql: (sql: string) => Promise<unknown>
    dispatchOp: (op: string) => Promise<unknown>
  }
}) {
  const logs: string[] = []
  const sandbox = {
    console: {
      log: (...values: unknown[]) => {
        logs.push(values.map((value) => String(value)).join(" "))
      },
    },
    helpers: buildHelpers(),
  }
  const context = vm.createContext(sandbox, {
    codeGeneration: {
      strings: false,
      wasm: false,
    },
  })
  const script = new vm.Script(
    `(async ({ broker, question, context, helpers, console }) => {${input.scriptBody}\n})`,
    {
      filename: "agent-generated-analysis.js",
    }
  )
  const runner = script.runInContext(context, {
    timeout: EXECUTION_TIMEOUT_MS,
  }) as (args: {
    broker: typeof input.broker
    question: string
    context: AgentExecutorRequest["context"]
    helpers: ReturnType<typeof buildHelpers>
    console: typeof sandbox.console
  }) => Promise<unknown>

  const result = await Promise.race([
    runner({
      broker: input.broker,
      console: sandbox.console,
      context: input.context,
      helpers: sandbox.helpers,
      question: input.question,
    }),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error("Agent analysis script timed out."))
      }, EXECUTION_TIMEOUT_MS)
    }),
  ])

  return {
    logs,
    result: (result ?? {}) as Record<string, unknown>,
  }
}

export async function executeAgentRunLocally(
  input: AgentExecutorInput
): Promise<AgentExecutorResult> {
  const sqlQueries: string[] = []
  const opsDispatched: string[] = []
  const warnings: string[] = []
  const allowedOps = new Set(
    (Array.isArray(input.allowedOps) ? input.allowedOps : [])
      .map((op) => String(op ?? "").trim())
      .filter(Boolean)
  )

  const executed = await executeScriptBody({
    broker: {
      dispatchOp: async (op) => {
        if (!allowedOps.has(op)) {
          throw new Error(
            `Operation "${op}" is not allowed for this executor request.`
          )
        }

        opsDispatched.push(op)
        return runAgentOpsBroker({
          op: op as "jobs:contracts:refresh" | "jobs:hourly" | "jobs:reconcile",
          workspaceId: input.context.workspaceId,
        })
      },
      getDataset: async (name) =>
        runAgentDatasetBroker({
          context: {
            compare: input.context.compare,
            from: input.context.from,
            session: {
              defaultWorkspaceId: input.context.workspaceId,
              email: null,
              role: "admin",
              source: "env-stub",
              userId: "local-agent",
              workspaceMemberships: [
                {
                  id: input.context.workspaceId,
                  label: input.context.workspaceId,
                },
              ],
            },
            to: input.context.to,
            workspaceId: input.context.workspaceId,
          },
          dataset: name,
        }),
      querySql: async (sql) => {
        sqlQueries.push(sql)
        return runAgentSqlBroker({
          sql,
          workspaceId: input.context.workspaceId,
        })
      },
    },
    context: input.context,
    question: input.question,
    scriptBody: input.scriptBody,
  })

  return {
    logs: executed.logs,
    opsDispatched,
    result: executed.result,
    sqlQueries,
    warnings,
  }
}

export async function executeAgentRunViaBroker(
  input: AgentExecutorInput
): Promise<AgentExecutorResult> {
  const sqlQueries: string[] = []
  const opsDispatched: string[] = []
  const warnings: string[] = []
  const allowedOps = new Set(
    (Array.isArray(input.allowedOps) ? input.allowedOps : [])
      .map((op) => String(op ?? "").trim())
      .filter(Boolean)
  )

  const executed = await executeScriptBody({
    broker: {
      dispatchOp: async (op) => {
        if (!allowedOps.has(op)) {
          throw new Error(
            `Operation "${op}" is not allowed for this executor request.`
          )
        }

        opsDispatched.push(op)
        const response = await fetch(`${input.brokerBaseUrl}/ops`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.brokerToken}`,
          },
          body: JSON.stringify({ op }),
        })

        if (!response.ok) {
          throw new Error(await response.text())
        }

        return response.json()
      },
      getDataset: async (name) => {
        const response = await fetch(`${input.brokerBaseUrl}/datasets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.brokerToken}`,
          },
          body: JSON.stringify({
            context: input.context,
            dataset: name,
          }),
        })

        if (!response.ok) {
          throw new Error(await response.text())
        }

        return response.json()
      },
      querySql: async (sql) => {
        sqlQueries.push(sql)
        const response = await fetch(`${input.brokerBaseUrl}/sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.brokerToken}`,
          },
          body: JSON.stringify({ sql }),
        })

        if (!response.ok) {
          throw new Error(await response.text())
        }

        return response.json()
      },
    },
    context: input.context,
    question: input.question,
    scriptBody: input.scriptBody,
  })

  return {
    logs: executed.logs,
    opsDispatched,
    result: executed.result,
    sqlQueries,
    warnings,
  }
}

export async function executeAgentRun(
  input: AgentExecutorInput
): Promise<AgentExecutorResult> {
  if (!env.agent.executorUrl) {
    return executeAgentRunLocally(input)
  }

  const body = JSON.stringify(input)
  const response = await fetch(`${env.agent.executorUrl.replace(/\/$/, "")}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-agent-signature": signRequestBody(body, env.agent.sharedSecret),
    },
    body,
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(
      `Agent executor request failed (${response.status}): ${detail || "Unknown error"}`
    )
  }

  return (await response.json()) as AgentExecutorResult
}

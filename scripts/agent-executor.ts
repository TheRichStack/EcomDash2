#!/usr/bin/env node

import http from "node:http"

import { env } from "@/lib/env"
import { executeAgentRunViaBroker } from "@/lib/agent/executor"
import type { AgentExecutorRequest } from "@/lib/agent/types"
import { verifyRequestBodySignature } from "@/lib/agent/utils"

const port = Number(process.env.PORT ?? 4319)

function readBody(request: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []

    request.on("data", (chunk) => {
      chunks.push(Buffer.from(chunk))
    })
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"))
    })
    request.on("error", reject)
  })
}

const server = http.createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json",
    })
    response.end(JSON.stringify({ ok: true }))
    return
  }

  if (request.method !== "POST" || request.url !== "/execute") {
    response.writeHead(404, {
      "Content-Type": "application/json",
    })
    response.end(JSON.stringify({ message: "Not found." }))
    return
  }

  try {
    const rawBody = await readBody(request)
    const signature = String(request.headers["x-agent-signature"] ?? "")

    if (!verifyRequestBodySignature(rawBody, signature, env.agent.sharedSecret)) {
      response.writeHead(401, {
        "Content-Type": "application/json",
      })
      response.end(JSON.stringify({ message: "Invalid request signature." }))
      return
    }

    const payload = JSON.parse(rawBody) as AgentExecutorRequest
    const result = await executeAgentRunViaBroker(payload)

    response.writeHead(200, {
      "Content-Type": "application/json",
    })
    response.end(JSON.stringify(result))
  } catch (error) {
    response.writeHead(500, {
      "Content-Type": "application/json",
    })
    response.end(
      JSON.stringify({
        message:
          error instanceof Error ? error.message : "Agent executor failed.",
      })
    )
  }
})

server.listen(port, () => {
  console.log(`EcomDash2 agent executor listening on port ${port}`)
})

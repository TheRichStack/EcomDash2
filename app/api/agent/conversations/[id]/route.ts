import {
  deleteAgentConversation,
  getAgentConversationById,
  updateAgentConversationTitle,
} from "@/lib/agent/storage"
import { resolveDashboardSession } from "@/lib/dashboard-session"

export const dynamic = "force-dynamic"

function assertWorkspaceMembership(
  session: Awaited<ReturnType<typeof resolveDashboardSession>>,
  workspaceId: string
) {
  const allowed = session.workspaceMemberships.some(
    (workspace) => workspace.id === workspaceId
  )

  if (!allowed) {
    throw new Error("The selected workspace is not available in the current session.")
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await resolveDashboardSession()
  const { id } = await context.params
  const body = (await request.json()) as {
    title?: string
  }
  const conversationId = String(id ?? "").trim()
  const title = String(body.title ?? "").trim()

  if (!conversationId) {
    return Response.json({ message: "Conversation id is required." }, { status: 400 })
  }

  if (!title) {
    return Response.json({ message: "Title is required." }, { status: 400 })
  }

  const conversation = await getAgentConversationById(conversationId)

  if (!conversation) {
    return Response.json({ message: "Conversation not found." }, { status: 404 })
  }

  assertWorkspaceMembership(session, conversation.workspaceId)

  await updateAgentConversationTitle({
    conversationId,
    title,
  })

  const updated = await getAgentConversationById(conversationId)

  return Response.json({
    conversation: updated,
  })
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await resolveDashboardSession()
  const { id } = await context.params
  const conversationId = String(id ?? "").trim()

  if (!conversationId) {
    return Response.json({ message: "Conversation id is required." }, { status: 400 })
  }

  const conversation = await getAgentConversationById(conversationId)

  if (!conversation) {
    return Response.json({ message: "Conversation not found." }, { status: 404 })
  }

  assertWorkspaceMembership(session, conversation.workspaceId)
  await deleteAgentConversation(conversationId)

  return Response.json({
    ok: true,
  })
}

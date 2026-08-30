import { and, asc, desc, eq, lt } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { createDatabase } from "../db/client";
import { projectExists } from "../db/projects";
import { aiActions, aiConversations, aiMessages } from "../db/schema";
import { AgentConfigurationError } from "../services/research-agent";
import { disposePiAgentSession, runPiAgentTurn, type PiAgentStreamEvent } from "../services/pi-agent";
import type { AppEnv } from "../types";

/** Canonical Research Agent mode (legacy aliases accepted on create). */
const conversationModeSchema = z
  .enum(["research_agent", "pi_research", "research_orchestrator"])
  .transform(() => "research_agent" as const);

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
function toMessage(row: typeof aiMessages.$inferSelect) {
  return { ...row, citations: parseJson(row.citationsJson, []), citationsJson: undefined };
}
function toAction(row: typeof aiActions.$inferSelect) {
  return {
    ...row,
    input: parseJson(row.inputJson, {}),
    output: parseJson(row.outputJson, {}),
    inputJson: undefined,
    outputJson: undefined,
  };
}

function encodeSse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const conversationRoutes = new Hono<AppEnv>();

conversationRoutes.get("/projects/:projectId/ai/conversations", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const rows = await createDatabase(c.env)
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.projectId, projectId))
    .orderBy(desc(aiConversations.updatedAt));
  return c.json({ conversations: rows });
});

conversationRoutes.post("/projects/:projectId/ai/conversations", async (c) => {
  const projectId = c.req.param("projectId");
  if (!(await projectExists(c.env, projectId))) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
  const parsed = z
    .object({
      title: z.string().min(1).max(200).default("新研究对话"),
      mode: conversationModeSchema.default("research_agent"),
    })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "INVALID_CONVERSATION", issues: parsed.error.issues }, 400);
  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    projectId,
    title: parsed.data.title,
    mode: parsed.data.mode,
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };
  await createDatabase(c.env).insert(aiConversations).values(conversation);
  return c.json({ conversation }, 201);
});

conversationRoutes.get("/projects/:projectId/ai/conversations/:conversationId", async (c) => {
  const projectId = c.req.param("projectId");
  const conversationId = c.req.param("conversationId");
  const db = createDatabase(c.env);
  const conversation = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.projectId, projectId)))
    .get();
  if (!conversation) return c.json({ error: "CONVERSATION_NOT_FOUND" }, 404);
  // Heal stale pending rows (hot-reload / killed API). Skip fresh ones so an in-flight turn is not raced.
  const staleBefore = new Date(Date.now() - 90_000).toISOString();
  await db
    .update(aiMessages)
    .set({ status: "failed", error: "回合连接中断，请重试" })
    .where(
      and(
        eq(aiMessages.conversationId, conversationId),
        eq(aiMessages.status, "pending"),
        lt(aiMessages.createdAt, staleBefore),
      ),
    );
  const [messages, actions] = await Promise.all([
    db.select().from(aiMessages).where(eq(aiMessages.conversationId, conversationId)).orderBy(asc(aiMessages.createdAt)),
    db.select().from(aiActions).where(eq(aiActions.conversationId, conversationId)).orderBy(asc(aiActions.createdAt)),
  ]);
  return c.json({ conversation, messages: messages.map(toMessage), actions: actions.map(toAction) });
});

conversationRoutes.post("/projects/:projectId/ai/conversations/:conversationId/messages", async (c) => {
  const projectId = c.req.param("projectId");
  const conversationId = c.req.param("conversationId");
  const parsed = z.object({ content: z.string().trim().min(1).max(12_000) }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_MESSAGE", issues: parsed.error.issues }, 400);
  const db = createDatabase(c.env);
  const conversation = await db
    .select()
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.projectId, projectId)))
    .get();
  if (!conversation) return c.json({ error: "CONVERSATION_NOT_FOUND" }, 404);
  if (conversation.status !== "active") {
    return c.json({ error: "CONVERSATION_CANCELLED", message: "该会话已结束，请新建会话后继续" }, 409);
  }

  // Heal turns left pending when SSE was aborted (Vite proxy / API hot-reload).
  await db
    .update(aiMessages)
    .set({ status: "failed", error: "上一回合连接中断，请重试" })
    .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.status, "pending")));

  const historyRows = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.status, "completed")))
    .orderBy(desc(aiMessages.createdAt))
    .limit(12);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const assistantId = crypto.randomUUID();
  await db.insert(aiMessages).values([
    {
      id: userId,
      conversationId,
      projectId,
      role: "user",
      content: parsed.data.content,
      citationsJson: "[]",
      model: null,
      status: "completed",
      error: "",
      createdAt: now,
    },
    {
      id: assistantId,
      conversationId,
      projectId,
      role: "assistant",
      content: "",
      citationsJson: "[]",
      model: null,
      status: "pending",
      error: "",
      createdAt: new Date(Date.now() + 1).toISOString(),
    },
  ]);
  const title = conversation.title === "新研究对话" ? parsed.data.content.slice(0, 40) : conversation.title;
  await db.update(aiConversations).set({ title, updatedAt: now }).where(eq(aiConversations.id, conversationId));

  const turn = {
    projectId,
    conversationId,
    assistantMessageId: assistantId,
    message: parsed.data.content,
    history: historyRows.reverse().map((row) => ({ role: row.role as "user" | "assistant", content: row.content })),
  };

  const encoder = new TextEncoder();
  let settled = false;
  const markFailed = async (message: string) => {
    if (settled) return;
    settled = true;
    await db
      .update(aiMessages)
      .set({ content: "", status: "failed", error: message })
      .where(and(eq(aiMessages.id, assistantId), eq(aiMessages.status, "pending")));
  };

  const abortSignal = c.req.raw.signal;
  const onAbort = () => {
    disposePiAgentSession(conversationId);
    void markFailed("连接中断（开发热重载、代理断开或浏览器取消）。请新建对话或重试。");
  };
  abortSignal.addEventListener("abort", onAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event, data)));
        } catch {
          // Client already disconnected.
        }
      };
      try {
        const result = await runPiAgentTurn(c.env, turn, (event: PiAgentStreamEvent) => {
          send(event.type, event);
        });
        if (abortSignal.aborted) {
          await markFailed("连接中断（开发热重载、代理断开或浏览器取消）。请新建对话或重试。");
          return;
        }
        const completedAt = new Date().toISOString();
        const citationsJson = JSON.stringify(result.citations ?? []);
        await db
          .update(aiMessages)
          .set({
            content: result.reply,
            citationsJson,
            model: result.model,
            status: "completed",
            error: "",
          })
          .where(eq(aiMessages.id, assistantId));
        settled = true;
        await db.update(aiConversations).set({ updatedAt: completedAt }).where(eq(aiConversations.id, conversationId));
        const assistant = await db.select().from(aiMessages).where(eq(aiMessages.id, assistantId)).get();
        send("done", {
          message: toMessage(assistant!),
          actions: result.actions,
          mode: "research_agent",
        });
      } catch (error) {
        const code = error instanceof AgentConfigurationError ? error.code : "PI_AGENT_FAILED";
        const message = error instanceof Error ? error.message : "Research Agent 暂时无法完成此回合";
        await markFailed(message);
        send("error", { code, message, assistantMessageId: assistantId, retryable: true });
      } finally {
        abortSignal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      onAbort();
    },
  });

  return c.newResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});

conversationRoutes.post("/projects/:projectId/ai/conversations/:conversationId/cancel", async (c) => {
  const projectId = c.req.param("projectId");
  const conversationId = c.req.param("conversationId");
  const db = createDatabase(c.env);
  const conversation = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.projectId, projectId)))
    .get();
  if (!conversation) return c.json({ error: "CONVERSATION_NOT_FOUND" }, 404);
  disposePiAgentSession(conversationId);
  const now = new Date().toISOString();
  await db.update(aiConversations).set({ status: "cancelled", updatedAt: now }).where(eq(aiConversations.id, conversationId));
  await db
    .update(aiMessages)
    .set({ status: "cancelled", error: "用户取消" })
    .where(and(eq(aiMessages.conversationId, conversationId), eq(aiMessages.status, "pending")));
  return c.json({ id: conversationId, status: "cancelled" });
});

conversationRoutes.delete("/projects/:projectId/ai/conversations/:conversationId", async (c) => {
  const projectId = c.req.param("projectId");
  const conversationId = c.req.param("conversationId");
  const db = createDatabase(c.env);
  const conversation = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.projectId, projectId)))
    .get();
  if (!conversation) return c.json({ error: "CONVERSATION_NOT_FOUND" }, 404);
  disposePiAgentSession(conversationId);
  await db.delete(aiActions).where(eq(aiActions.conversationId, conversationId));
  await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
  await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));
  return c.json({ id: conversationId, deleted: true });
});

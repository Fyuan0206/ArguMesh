/**
 * Pi coding-agent SDK adapter for ArguMesh.
 * Reuses Settings AI credentials; disables bash/write/edit; domain tools write drafts only.
 */
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { AppBindings } from "../types";
import { resolveAiForRequest } from "./ai";
import { createPiModelBridge } from "./pi-runtime";
import { assembleProjectContext } from "./project-context";
import {
  AgentConfigurationError,
  executeWhitelistedAgentAction,
  type AgentTurnInput,
} from "./research-agent";

export type PiAgentStreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolName: string; toolCallId: string }
  | { type: "tool_end"; toolName: string; toolCallId: string; isError: boolean; detail?: string }
  | { type: "agent_end" }
  | { type: "error"; code: string; message: string };

interface CachedSession {
  session: AgentSession;
  unsubscribe: () => void;
  projectId: string;
}

const sessionCache = new Map<string, CachedSession>();

function summarizeContext(context: NonNullable<Awaited<ReturnType<typeof assembleProjectContext>>>) {
  return {
    project: context.project,
    literature: context.literature.map((paper) => ({
      id: paper.id,
      title: paper.title,
      year: paper.year,
      readingStatus: paper.readingStatus,
    })),
    insights: context.researchThread.knowledge.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      status: item.status,
      paperId: item.paperId,
    })),
    gaps: context.researchThread.gaps.map((item) => ({ id: item.id, title: item.title, status: item.status })),
    ideas: context.researchThread.ideas.map((item) => ({ id: item.id, title: item.title, status: item.status })),
    questions: context.researchThread.questions.map((item) => ({
      id: item.id,
      question: item.question,
      status: item.status,
    })),
    experiments: context.experiments.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      rqId: item.rqId,
      resultCount: item.results.length,
    })),
    matrices: context.evidenceMatrices.map((item) => ({
      id: item.id,
      name: item.name,
      cellCount: item.cells.length,
    })),
  };
}

function buildDomainTools(env: AppBindings, turn: AgentTurnInput, recordedActions: unknown[]) {
  return [
    defineTool({
      name: "project_context",
      label: "Project context",
      description: "Read a bounded snapshot of the current ArguMesh project.",
      parameters: Type.Object({}),
      execute: async () => {
        const context = await assembleProjectContext(env, turn.projectId);
        if (!context) return { content: [{ type: "text" as const, text: "PROJECT_NOT_FOUND" }], details: {} };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(summarizeContext(context)) }],
          details: {},
        };
      },
    }),
    defineTool({
      name: "insight_create_draft",
      label: "Create insight draft",
      description: "Create a draft insight. Never marks items confirmed.",
      parameters: Type.Object({
        type: Type.Union([
          Type.Literal("finding"),
          Type.Literal("contradiction"),
          Type.Literal("gap"),
          Type.Literal("concept"),
        ]),
        title: Type.String({ minLength: 1, maxLength: 200 }),
        summary: Type.String({ minLength: 1, maxLength: 4_000 }),
        paperId: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
        evidenceIds: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 160 }), { maxItems: 20 })),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
        const context = await assembleProjectContext(env, turn.projectId);
        if (!context) return { content: [{ type: "text" as const, text: "PROJECT_NOT_FOUND" }], details: {} };
        const result = await executeWhitelistedAgentAction(
          env,
          turn,
          {
            tool: "insight_create_draft",
            input: {
              type: params.type,
              title: params.title,
              summary: params.summary,
              paperId: params.paperId ?? null,
              evidenceIds: params.evidenceIds ?? [],
            },
          },
          context,
          "pi-agent",
          new Date().toISOString(),
        );
        recordedActions.push(result);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: {} };
      },
    }),
    defineTool({
      name: "research_question_link_evidence",
      label: "Link RQ evidence",
      description: "Link existing insight evidence IDs to a research question.",
      parameters: Type.Object({
        rqId: Type.String({ minLength: 1, maxLength: 160 }),
        evidenceIds: Type.Array(Type.String({ minLength: 1, maxLength: 160 }), { minItems: 1, maxItems: 30 }),
        stance: Type.Optional(
          Type.Union([Type.Literal("supports"), Type.Literal("contradicts"), Type.Literal("context")]),
        ),
        note: Type.Optional(Type.String({ maxLength: 2_000 })),
      }),
      execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
        const context = await assembleProjectContext(env, turn.projectId);
        if (!context) return { content: [{ type: "text" as const, text: "PROJECT_NOT_FOUND" }], details: {} };
        const result = await executeWhitelistedAgentAction(
          env,
          turn,
          {
            tool: "research_question_link_evidence",
            input: {
              rqId: params.rqId,
              evidenceIds: params.evidenceIds,
              stance: params.stance ?? "context",
              note: params.note ?? "",
            },
          },
          context,
          "pi-agent",
          new Date().toISOString(),
        );
        recordedActions.push(result);
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: {} };
      },
    }),
  ];
}

function mapSessionEvent(event: AgentSessionEvent): PiAgentStreamEvent | null {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    return { type: "text_delta", delta: event.assistantMessageEvent.delta };
  }
  if (event.type === "tool_execution_start") {
    return { type: "tool_start", toolName: event.toolName, toolCallId: event.toolCallId };
  }
  if (event.type === "tool_execution_end") {
    return {
      type: "tool_end",
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      isError: event.isError,
      detail: typeof event.result === "string" ? event.result.slice(0, 500) : undefined,
    };
  }
  if (event.type === "agent_end") return { type: "agent_end" };
  return null;
}

export function disposePiAgentSession(conversationId: string) {
  const cached = sessionCache.get(conversationId);
  if (!cached) return;
  cached.unsubscribe();
  cached.session.dispose();
  sessionCache.delete(conversationId);
}

async function getOrCreateSession(
  env: AppBindings,
  turn: AgentTurnInput,
  onEvent: (event: PiAgentStreamEvent) => void,
  recordedActions: unknown[],
) {
  const existing = sessionCache.get(turn.conversationId);
  if (existing && existing.projectId === turn.projectId) {
    existing.unsubscribe();
    const unsubscribe = existing.session.subscribe((event) => {
      const mapped = mapSessionEvent(event);
      if (mapped) onEvent(mapped);
    });
    existing.unsubscribe = unsubscribe;
    return existing.session;
  }
  if (existing) disposePiAgentSession(turn.conversationId);

  const resolution = await resolveAiForRequest(env, {});
  if ("error" in resolution) {
    throw new AgentConfigurationError(resolution.error.code, resolution.error.message);
  }

  const bridge = await createPiModelBridge(resolution.provider, resolution.model);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: process.cwd(),
    agentDir: bridge.agentDir,
    settingsManager,
    systemPromptOverride: () =>
      [
        "You are ArguMesh Pi Research Agent — a multi-step research assistant in a local literature workbench.",
        "Evidence first: do not invent papers, metrics, or experiment results.",
        "Call project_context before making project-specific claims when unsure.",
        "Writes must stay drafts via insight_create_draft / research_question_link_evidence.",
        "You have no shell, filesystem write, or code execution tools.",
        "Reply in the user's language. Cite project object ids when relevant.",
      ].join("\n"),
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd: process.cwd(),
    agentDir: bridge.agentDir,
    model: bridge.model,
    thinkingLevel: "off",
    modelRuntime: bridge.modelRuntime,
    tools: ["project_context", "insight_create_draft", "research_question_link_evidence"],
    customTools: buildDomainTools(env, turn, recordedActions),
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
  });

  const unsubscribe = session.subscribe((event) => {
    const mapped = mapSessionEvent(event);
    if (mapped) onEvent(mapped);
  });
  sessionCache.set(turn.conversationId, { session, unsubscribe, projectId: turn.projectId });
  return session;
}

export interface RunPiAgentTurnResult {
  reply: string;
  model: string;
  actions: unknown[];
}

/** Run one user turn (multi-step domain tools; coding tools disabled). */
export async function runPiAgentTurn(
  env: AppBindings,
  turn: AgentTurnInput,
  onEvent: (event: PiAgentStreamEvent) => void,
): Promise<RunPiAgentTurnResult> {
  const recordedActions: unknown[] = [];
  const session = await getOrCreateSession(env, turn, onEvent, recordedActions);
  const resolution = await resolveAiForRequest(env, {});
  if ("error" in resolution) {
    throw new AgentConfigurationError(resolution.error.code, resolution.error.message);
  }

  try {
    await session.prompt(turn.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pi Agent turn failed";
    onEvent({ type: "error", code: "PI_AGENT_FAILED", message });
    throw error;
  }

  const assistantMessages = session.messages.filter((message) => message.role === "assistant");
  const last = assistantMessages.at(-1);
  let reply = "";
  if (last && "content" in last && Array.isArray(last.content)) {
    reply = last.content
      .filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("\n")
      .trim();
  }
  if (!reply) reply = "(no text reply this turn)";

  onEvent({ type: "agent_end" });
  return { reply, model: resolution.model, actions: recordedActions };
}

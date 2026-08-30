/**
 * Pi coding-agent SDK — the Research Agent substrate for ArguMesh.
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

interface SessionState {
  turn: AgentTurnInput;
  recordedActions: unknown[];
}

interface CachedSession {
  session: AgentSession;
  unsubscribe: () => void;
  projectId: string;
  state: SessionState;
}

const sessionCache = new Map<string, CachedSession>();

const TOOL_NAMES = [
  "project_context",
  "insight_create_draft",
  "research_question_create_draft",
  "research_question_link_evidence",
  "experiment_design_create_draft",
  "ablation_design_add",
  "result_analysis_create_draft",
  "paper_patch_propose",
  "bibliography_entry_propose",
  "latex_compile",
] as const;

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
    paper: context.paper
      ? {
          sourceVersion: context.paper.version,
          bibliographyVersion: context.paper.bibliographyVersion,
        }
      : null,
  };
}

async function runDomainAction(
  env: AppBindings,
  state: SessionState,
  action: Parameters<typeof executeWhitelistedAgentAction>[2],
) {
  const context = await assembleProjectContext(env, state.turn.projectId);
  if (!context) {
    return { content: [{ type: "text" as const, text: "PROJECT_NOT_FOUND" }], details: {} };
  }
  const result = await executeWhitelistedAgentAction(
    env,
    state.turn,
    action,
    context,
    "pi-agent",
    new Date().toISOString(),
  );
  state.recordedActions.push(result);
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }], details: {} };
}

function buildDomainTools(env: AppBindings, state: SessionState) {
  return [
    defineTool({
      name: "project_context",
      label: "Project context",
      description: "Read a bounded snapshot of the current ArguMesh project (papers, insights, RQs, experiments, paper versions).",
      parameters: Type.Object({}),
      execute: async () => {
        const context = await assembleProjectContext(env, state.turn.projectId);
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
      description: "Create a draft insight (finding/contradiction/gap/concept). Never marks items confirmed.",
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
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "insight_create_draft",
          input: {
            type: params.type,
            title: params.title,
            summary: params.summary,
            paperId: params.paperId ?? null,
            evidenceIds: params.evidenceIds ?? [],
          },
        }),
    }),
    defineTool({
      name: "research_question_create_draft",
      label: "Create RQ draft",
      description: "Create a draft research question from project evidence.",
      parameters: Type.Object({
        question: Type.String({ minLength: 1, maxLength: 2_000 }),
        goal: Type.Optional(Type.String({ maxLength: 2_000 })),
      }),
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "research_question_create_draft",
          input: { question: params.question, goal: params.goal ?? "" },
        }),
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
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "research_question_link_evidence",
          input: {
            rqId: params.rqId,
            evidenceIds: params.evidenceIds,
            stance: params.stance ?? "context",
            note: params.note ?? "",
          },
        }),
    }),
    defineTool({
      name: "experiment_design_create_draft",
      label: "Create experiment draft",
      description: "Create a planned experiment design draft (structured design object).",
      parameters: Type.Object({
        title: Type.String({ minLength: 1, maxLength: 200 }),
        rqId: Type.Optional(Type.Union([Type.String({ maxLength: 160 }), Type.Null()])),
        design: Type.Any(),
      }),
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "experiment_design_create_draft",
          input: {
            title: params.title,
            rqId: params.rqId ?? null,
            design: params.design as never,
          },
        }),
    }),
    defineTool({
      name: "ablation_design_add",
      label: "Add ablation draft",
      description: "Append a structured ablation to a planned experiment.",
      parameters: Type.Object({
        experimentId: Type.String({ minLength: 1, maxLength: 160 }),
        ablation: Type.Any(),
      }),
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "ablation_design_add",
          input: {
            experimentId: params.experimentId,
            ablation: params.ablation as never,
          },
        }),
    }),
    defineTool({
      name: "result_analysis_create_draft",
      label: "Analyze results draft",
      description: "Save a cited result-analysis draft for an imported experiment result.",
      parameters: Type.Object({
        experimentId: Type.String({ minLength: 1, maxLength: 160 }),
        resultId: Type.String({ minLength: 1, maxLength: 160 }),
        analysis: Type.Any(),
      }),
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "result_analysis_create_draft",
          input: {
            experimentId: params.experimentId,
            resultId: params.resultId,
            analysis: params.analysis as never,
          },
        }),
    }),
    defineTool({
      name: "paper_patch_propose",
      label: "Propose paper Diff",
      description: "Propose a paper source Diff without applying it. baseVersion must match current sourceVersion from project_context.",
      parameters: Type.Object({
        summary: Type.String({ minLength: 1, maxLength: 2_000 }),
        proposedSource: Type.String({ minLength: 1, maxLength: 500_000 }),
        baseVersion: Type.String({ minLength: 64, maxLength: 64 }),
        warnings: Type.Optional(Type.Array(Type.String({ maxLength: 1_000 }), { maxItems: 50 })),
      }),
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "paper_patch_propose",
          input: {
            summary: params.summary,
            proposedSource: params.proposedSource,
            baseVersion: params.baseVersion,
            warnings: params.warnings ?? [],
          },
        }),
    }),
    defineTool({
      name: "bibliography_entry_propose",
      label: "Propose BibTeX entry",
      description: "Propose a bibliography entry without changing references.bib. baseVersion must match bibliographyVersion.",
      parameters: Type.Object({
        citationKey: Type.String({ minLength: 1, maxLength: 120 }),
        entry: Type.String({ minLength: 1, maxLength: 20_000 }),
        baseVersion: Type.String({ minLength: 64, maxLength: 64 }),
      }),
      execute: async (_toolCallId, params) =>
        runDomainAction(env, state, {
          tool: "bibliography_entry_propose",
          input: {
            citationKey: params.citationKey,
            entry: params.entry,
            baseVersion: params.baseVersion,
          },
        }),
    }),
    defineTool({
      name: "latex_compile",
      label: "Compile LaTeX",
      description: "Run the allowlisted local LaTeX compile for the project paper workspace.",
      parameters: Type.Object({}),
      execute: async () => runDomainAction(env, state, { tool: "latex_compile", input: {} }),
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
  state: SessionState,
) {
  const existing = sessionCache.get(turn.conversationId);
  if (existing && existing.projectId === turn.projectId) {
    existing.state.turn = turn;
    existing.state.recordedActions = state.recordedActions;
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
        "You are ArguMesh Research Agent — the project-scoped research assistant built on the Pi AgentSession substrate.",
        "Evidence first: do not invent papers, metrics, or experiment results.",
        "Call project_context before making project-specific claims when unsure.",
        "Writes must stay drafts via the domain tools listed below; never claim confirmation or silent overwrite.",
        "Available write tools: insight_create_draft, research_question_create_draft, research_question_link_evidence,",
        "experiment_design_create_draft, ablation_design_add, result_analysis_create_draft,",
        "paper_patch_propose, bibliography_entry_propose, latex_compile.",
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
    tools: [...TOOL_NAMES],
    customTools: buildDomainTools(env, state),
    resourceLoader,
    sessionManager: SessionManager.inMemory(),
    settingsManager,
  });

  const unsubscribe = session.subscribe((event) => {
    const mapped = mapSessionEvent(event);
    if (mapped) onEvent(mapped);
  });
  sessionCache.set(turn.conversationId, { session, unsubscribe, projectId: turn.projectId, state });
  return session;
}

export interface RunPiAgentTurnResult {
  reply: string;
  model: string;
  actions: unknown[];
}

/** Run one user turn through the Pi AgentSession (multi-step domain tools; coding tools disabled). */
export async function runPiAgentTurn(
  env: AppBindings,
  turn: AgentTurnInput,
  onEvent: (event: PiAgentStreamEvent) => void,
): Promise<RunPiAgentTurnResult> {
  const state: SessionState = { turn, recordedActions: [] };
  const session = await getOrCreateSession(env, turn, onEvent, state);
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
  return { reply, model: resolution.model, actions: state.recordedActions };
}

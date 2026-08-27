import { and, eq } from "drizzle-orm";
import { experimentDesignSchema, runResearchAgentTurn, type researchAgentOutputSchema } from "../ai/capabilities";
import { createDatabase } from "../db/client";
import {
  aiActions, aiConversations, experimentResults, experiments, gaps, ideas, ideaVersions,
  knowledgeItems, knowledgeRelations, researchQuestionEvidence, researchQuestions,
} from "../db/schema";
import type { AppBindings } from "../types";
import { resolveAiForRequest } from "./ai";
import { assembleProjectContext } from "./project-context";
import { containsDangerousLatex } from "./paper-files";
import { analysisReferencesExist, persistResultAnalysisDraft } from "./result-analysis";
import { compilePaper } from "./latex";
import type { z } from "zod";

type AgentOutput = z.infer<typeof researchAgentOutputSchema>;

export interface AgentTurnInput {
  projectId: string;
  conversationId: string;
  assistantMessageId: string;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

/** 单回合固定为 1 次模型调用 + 最多 1 个类型化写动作。 */
export async function executeResearchAgentTurn(env: AppBindings, input: AgentTurnInput) {
  const context = await assembleProjectContext(env, input.projectId);
  if (!context) throw new Error("PROJECT_NOT_FOUND");
  const resolution = await resolveAiForRequest(env, {});
  if ("error" in resolution) throw new AgentConfigurationError(resolution.error.code, resolution.error.message);
  const generated = await runResearchAgentTurn(env, {
    context, history: input.history, message: input.message,
    providerConfig: resolution.provider, model: resolution.model,
  });
  const citations = sanitizeCitations(generated.data.citations, context);
  const action = generated.data.action
    ? await executeAction(env, input, generated.data.action, context, generated.model, generated.generatedAt)
    : null;
  return { ...generated.data, citations, action, model: generated.model, generatedAt: generated.generatedAt };
}

function sanitizeCitations(citations: AgentOutput["citations"], context: NonNullable<Awaited<ReturnType<typeof assembleProjectContext>>>) {
  const allowed = new Map<string, string>();
  allowed.set(`project:${context.project.id}`, `/projects/${encodeURIComponent(context.project.id)}`);
  for (const paper of context.literature) allowed.set(`paper:${paper.id}`, `/projects/${encodeURIComponent(context.project.id)}/library/${encodeURIComponent(paper.id)}`);
  for (const matrix of context.evidenceMatrices) {
    const href = `/projects/${encodeURIComponent(context.project.id)}/matrices/${encodeURIComponent(matrix.id)}`;
    allowed.set(`matrix:${matrix.id}`, href);
    for (const cell of matrix.cells) allowed.set(`evidence:${cell.id}`, href);
  }
  for (const item of context.researchThread.knowledge) allowed.set(`insight:${item.id}`, `/projects/${encodeURIComponent(context.project.id)}/research?view=insights`);
  for (const item of context.researchThread.gaps) allowed.set(`insight:${item.id}`, `/projects/${encodeURIComponent(context.project.id)}/research?view=insights&type=gap`);
  for (const item of context.researchThread.ideas) allowed.set(`insight:${item.id}`, `/projects/${encodeURIComponent(context.project.id)}/research?view=insights&type=concept`);
  for (const item of context.researchThread.questions) allowed.set(`research_question:${item.id}`, `/projects/${encodeURIComponent(context.project.id)}/research?view=questions`);
  for (const experiment of context.experiments) {
    allowed.set(`experiment:${experiment.id}`, `/projects/${encodeURIComponent(context.project.id)}/experiments`);
    for (const result of experiment.results) allowed.set(`result:${result.id}`, `/projects/${encodeURIComponent(context.project.id)}/experiments`);
  }
  return citations.flatMap((citation) => {
    const href = allowed.get(`${citation.kind}:${citation.id}`);
    return href ? [{ ...citation, href }] : [];
  });
}

async function executeAction(
  env: AppBindings,
  input: AgentTurnInput,
  action: NonNullable<AgentOutput["action"]>,
  context: NonNullable<Awaited<ReturnType<typeof assembleProjectContext>>>,
  model: string,
  generatedAt: string,
) {
  const db = createDatabase(env);
  const conversation = await db.select({ status: aiConversations.status }).from(aiConversations).where(eq(aiConversations.id, input.conversationId)).get();
  if (conversation?.status !== "active") return recordAction(env, input, action, "cancelled", {}, "会话已取消");
  try {
    if (action.tool === "insight_create_draft") {
      const evidenceIds = [...new Set(action.input.evidenceIds)];
      const evidence = context.researchThread.knowledge.filter((item) => evidenceIds.includes(item.id));
      if (evidence.length !== evidenceIds.length) throw new Error("洞见证据不属于当前项目");
      const paperId = action.input.paperId ?? evidence[0]?.paperId ?? null;
      if ((action.input.type === "finding" || action.input.type === "contradiction") && !paperId) throw new Error("发现或矛盾草稿必须关联项目文献");
      if (paperId && !context.literature.some((paper) => paper.id === paperId)) throw new Error("洞见文献不属于当前项目");
      if (action.input.type === "contradiction" && !evidenceIds.length) throw new Error("矛盾草稿必须关联至少一条项目证据");
      const id = crypto.randomUUID(); const now = new Date().toISOString();
      if (action.input.type === "finding" || action.input.type === "contradiction") {
        await db.insert(knowledgeItems).values({
          id, projectId: input.projectId, paperId: paperId as string, kind: "claim", title: action.input.title,
          content: action.input.summary, quote: "", note: action.input.type === "contradiction" ? "AI 识别的待核验矛盾" : "",
          page: 1, location: null, source: "ai", status: "draft", model, generatedAt, createdAt: now, updatedAt: now,
        });
        if (action.input.type === "contradiction") {
          for (const targetId of evidenceIds) {
            const [sourceId, normalizedTargetId] = [id, targetId].sort();
            await db.insert(knowledgeRelations).values({
              id: crypto.randomUUID(), projectId: input.projectId, sourceId, targetId: normalizedTargetId,
              type: "contradicts", note: action.input.summary, createdAt: now,
            });
          }
        }
      } else if (action.input.type === "gap") {
        await db.insert(gaps).values({
          id, projectId: input.projectId, paperId, rqId: null, title: action.input.title,
          description: action.input.summary, rationale: "由 Research Agent 基于项目证据形成的待核验缺口", status: "candidate",
          source: "ai", model, generatedAt, note: "", createdAt: now, updatedAt: now,
        });
      } else {
        const versionId = crypto.randomUUID();
        await db.insert(ideas).values({
          id, projectId: input.projectId, sourceGapId: null, rqId: null, title: action.input.title,
          summary: action.input.summary, status: "Inbox", currentVersionId: null, createdAt: now, updatedAt: now,
        });
        await db.insert(ideaVersions).values({
          id: versionId, ideaId: id, versionNo: 1, title: action.input.title,
          canvasJson: JSON.stringify({ problem: "", gap: "", hypothesis: action.input.summary, method: "", experiment: "", risks: "" }),
          summary: action.input.summary, rationale: "由 Research Agent 创建的构想草稿", createdBy: "ai", model, generatedAt, createdAt: now,
        });
        await db.update(ideas).set({ currentVersionId: versionId }).where(eq(ideas.id, id));
      }
      return recordAction(env, input, action, "completed", { id, href: `/projects/${encodeURIComponent(input.projectId)}/research?view=insights&type=${encodeURIComponent(action.input.type)}` }, "");
    }
    if (action.tool === "research_question_create_draft") {
      const id = crypto.randomUUID(); const now = new Date().toISOString();
      await db.insert(researchQuestions).values({
        id, projectId: input.projectId, question: action.input.question, goal: action.input.goal,
        status: "open", source: "ai", model: null, generatedAt: now, createdAt: now, updatedAt: now,
      });
      return recordAction(env, input, action, "completed", { id, href: `/projects/${encodeURIComponent(input.projectId)}/research?view=questions` }, "");
    }
    if (action.tool === "research_question_link_evidence") {
      if (!context.researchThread.questions.some((question) => question.id === action.input.rqId)) throw new Error("研究问题不属于当前项目");
      const evidenceIds = [...new Set(action.input.evidenceIds)];
      if (evidenceIds.some((id) => !context.researchThread.knowledge.some((item) => item.id === id))) throw new Error("研究问题证据不属于当前项目");
      const now = new Date().toISOString();
      for (const knowledgeItemId of evidenceIds) {
        const existing = await db.select({ id: researchQuestionEvidence.id }).from(researchQuestionEvidence)
          .where(and(eq(researchQuestionEvidence.rqId, action.input.rqId), eq(researchQuestionEvidence.knowledgeItemId, knowledgeItemId))).get();
        if (existing) {
          await db.update(researchQuestionEvidence).set({ stance: action.input.stance, note: action.input.note }).where(eq(researchQuestionEvidence.id, existing.id));
        } else {
          await db.insert(researchQuestionEvidence).values({
            id: crypto.randomUUID(), projectId: input.projectId, rqId: action.input.rqId, knowledgeItemId,
            stance: action.input.stance, note: action.input.note, createdAt: now,
          });
        }
      }
      return recordAction(env, input, action, "completed", { linked: evidenceIds.length, href: `/projects/${encodeURIComponent(input.projectId)}/research?view=questions` }, "");
    }
    if (action.tool === "experiment_design_create_draft") {
      if (action.input.rqId && !context.researchThread.questions.some((question) => question.id === action.input.rqId)) throw new Error("研究问题不属于当前项目");
      const id = crypto.randomUUID(); const now = new Date().toISOString();
      await db.insert(experiments).values({
        id, projectId: input.projectId, ideaId: null, rqId: action.input.rqId, title: action.input.title,
        hypothesis: action.input.design.hypothesis, configJson: JSON.stringify(action.input.design), repoUrl: "", commitHash: "", checkpointPath: "",
        status: "planned", conclusion: "", source: "ai", model: null, generatedAt: now, createdAt: now, updatedAt: now,
      });
      return recordAction(env, input, action, "completed", { id, href: `/projects/${encodeURIComponent(input.projectId)}/experiments` }, "");
    }
    if (action.tool === "ablation_design_add") {
      const experiment = context.experiments.find((item) => item.id === action.input.experimentId);
      if (!experiment) throw new Error("实验不属于当前项目上下文");
      if (experiment.status !== "planned") throw new Error("只能向计划中的实验追加消融草稿");
      const design = experimentDesignSchema.safeParse(experiment.design);
      if (!design.success) throw new Error("实验缺少可编辑的结构化设计");
      const nextDesign = { ...design.data, ablations: [...design.data.ablations, action.input.ablation] };
      const now = new Date().toISOString();
      await db.update(experiments).set({ configJson: JSON.stringify(nextDesign), source: "ai", model, generatedAt, updatedAt: now })
        .where(and(eq(experiments.id, experiment.id), eq(experiments.projectId, input.projectId)));
      return recordAction(env, input, action, "completed", { experimentId: experiment.id, ablationCount: nextDesign.ablations.length, href: `/projects/${encodeURIComponent(input.projectId)}/experiments?experiment=${encodeURIComponent(experiment.id)}` }, "");
    }
    if (action.tool === "result_analysis_create_draft") {
      const experiment = context.experiments.find((item) => item.id === action.input.experimentId);
      const result = experiment?.results.find((item) => item.id === action.input.resultId);
      if (!experiment || !result) throw new Error("实验结果不属于当前项目上下文");
      if (!analysisReferencesExist(action.input.analysis, result.rows)) throw new Error("分析包含不存在的结果行或字段引用");
      const existing = await db.select({ id: experimentResults.id }).from(experimentResults).where(eq(experimentResults.id, result.id)).get();
      if (!existing) throw new Error("实验结果不存在");
      const conclusion = await persistResultAnalysisDraft(env, {
        projectId: input.projectId, experimentId: experiment.id, rqId: experiment.rqId, resultId: result.id,
        analysis: action.input.analysis, model, generatedAt,
      });
      return recordAction(env, input, action, "completed", {
        resultId: result.id, conclusionId: conclusion?.id ?? null,
        href: `/projects/${encodeURIComponent(input.projectId)}/experiments?experiment=${encodeURIComponent(experiment.id)}&result=${encodeURIComponent(result.id)}`,
      }, "");
    }
    if (action.tool === "latex_compile") {
      const status = await compilePaper(env, input.projectId);
      return recordAction(env, input, action, "completed", { ...status, href: `/projects/${encodeURIComponent(input.projectId)}/writing` }, "");
    }
    if (action.tool === "bibliography_entry_propose") {
      if (!context.paper) throw new Error("论文尚未初始化");
      if (action.input.baseVersion !== context.paper.bibliographyVersion) throw new Error("参考文献文件已变化，请重新生成提案");
      if (containsDangerousLatex(action.input.entry)) throw new Error("BibTeX 提案包含不安全的文件或命令访问");
      const keyPattern = new RegExp(`@\\w+\\s*\\{\\s*${escapeRegex(action.input.citationKey)}\\s*,`, "i");
      if (!keyPattern.test(action.input.entry)) throw new Error("BibTeX 条目与 citationKey 不一致");
      if (keyPattern.test(context.paper.bibliography)) throw new Error("该 BibTeX 引用键已存在");
      const proposedSource = `${context.paper.bibliography.trimEnd()}\n\n${action.input.entry.trim()}\n`;
      return recordAction(env, input, action, "completed", {
        file: "references.bib", baseVersion: action.input.baseVersion,
        proposal: { summary: `新增 BibTeX 条目 ${action.input.citationKey}`, proposedSource, baseVersion: action.input.baseVersion, warnings: [] },
      }, "");
    }
    if (!context.paper) throw new Error("论文尚未初始化");
    if (action.input.baseVersion !== context.paper.version) throw new Error("论文原文已变化，请重新生成 Diff");
    if (containsDangerousLatex(action.input.proposedSource)) throw new Error("论文提案包含不安全的 LaTeX 文件或命令访问");
    return recordAction(env, input, action, "completed", {
      proposal: action.input,
      baseVersion: action.input.baseVersion,
    }, "");
  } catch (error) {
    return recordAction(env, input, action, "failed", {}, error instanceof Error ? error.message : "工具执行失败");
  }
}

async function recordAction(
  env: AppBindings,
  input: AgentTurnInput,
  action: NonNullable<AgentOutput["action"]>,
  status: "completed" | "failed" | "cancelled",
  output: Record<string, unknown>,
  error: string,
) {
  const id = crypto.randomUUID();
  const finalOutput = status !== "completed" ? output
    : action.tool === "paper_patch_propose"
      ? { ...output, href: `/projects/${encodeURIComponent(input.projectId)}/writing?proposal=${encodeURIComponent(id)}&file=main.tex` }
      : action.tool === "bibliography_entry_propose"
        ? { ...output, href: `/projects/${encodeURIComponent(input.projectId)}/writing?proposal=${encodeURIComponent(id)}&file=references.bib` }
        : output;
  const record = {
    id, conversationId: input.conversationId, messageId: input.assistantMessageId, projectId: input.projectId,
    toolName: action.tool, inputJson: JSON.stringify(action.input), outputJson: JSON.stringify(finalOutput), status, error,
    createdAt: new Date().toISOString(),
  };
  await createDatabase(env).insert(aiActions).values(record);
  return { id: record.id, toolName: record.toolName, status, input: action.input, output: finalOutput, error };
}

export class AgentConfigurationError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

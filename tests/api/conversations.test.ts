// @vitest-environment node
/**
 * Research Agent HTTP lifecycle + whitelist action persistence.
 * LLM turns always go through Pi SSE; action tests call executeWhitelistedAgentAction directly
 * (same write path Pi tools use).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createDatabase } from "../../server/db/client";
import { aiMessages } from "../../server/db/schema";
import { assembleProjectContext } from "../../server/services/project-context";
import { executeWhitelistedAgentAction, type AgentTurnInput } from "../../server/services/research-agent";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("persistent bounded Research Agent", () => {
  let context: TestContext;
  let conversationId = "";
  let paperVersion = "";
  let bibliographyVersion = "";
  let knowledgeId = "";
  let resultExperimentId = "";
  let resultId = "";
  let resultRqId = "";
  const projectId = "agent-project";
  const workspacePath = mkdtempSync(join(tmpdir(), "argumesh-agent-paper-"));

  beforeAll(async () => {
    context = await createTestContext();
    await app.request(`/api/projects/${projectId}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ name: "Agent 项目", description: "", workspacePath }) }, context.bindings);
    await app.request(`/api/projects/${projectId}/papers/agent-paper`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ title: "真实论文", authors: "A", venue: "V", year: 2026 }) }, context.bindings);
    const knowledgeResponse = await app.request(`/api/projects/${projectId}/knowledge`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ paperId: "agent-paper", kind: "evidence", title: "AP 证据", content: "遮挡模块提升 AP", status: "confirmed" }),
    }, context.bindings);
    knowledgeId = ((await knowledgeResponse.json()) as { item: { id: string } }).item.id;
    await app.request(`/api/matrices/agent-matrix`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({
        projectId, name: "方法对比矩阵", description: "比较遮挡建模方法", paperIds: ["agent-paper"],
        dimensions: [{ id: "agent-dim", label: "遮挡处理方法" }],
      }),
    }, context.bindings);
    await app.request(`/api/projects/${projectId}/paper/initialize`, { method: "POST" }, context.bindings);
    paperVersion = ((await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json()) as { version: string }).version;
    bibliographyVersion = ((await (await app.request(`/api/projects/${projectId}/paper/bibliography`, {}, context.bindings)).json()) as { version: string }).version;
    const rqResponse = await app.request(`/api/projects/${projectId}/research-questions`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ question: "遮挡建模是否提升 AP？", goal: "验证方法有效性" }),
    }, context.bindings);
    resultRqId = ((await rqResponse.json()) as { researchQuestion: { id: string } }).researchQuestion.id;
    const experimentResponse = await app.request(`/api/projects/${projectId}/experiments/design`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ title: "结果分析实验", rqId: resultRqId, design: {
        objective: "比较 AP", hypothesis: "方法组更好", datasets: ["demo"], baselines: ["baseline"], independentVariables: ["method"],
        dependentVariables: ["ap"], controlledVariables: ["seed"], metrics: ["AP"], procedure: ["统一比较"], successCriteria: ["AP 提升"], risks: [], ablations: [],
      } }),
    }, context.bindings);
    resultExperimentId = ((await experimentResponse.json()) as { experiment: { id: string } }).experiment.id;
    const resultResponse = await app.request(`/api/projects/${projectId}/experiments/${resultExperimentId}/results/import`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ sourceType: "csv", sourceName: "agent-results.csv", data: "method,ap\nbaseline,0.70\nours,0.78" }),
    }, context.bindings);
    resultId = ((await resultResponse.json()) as { result: { id: string } }).result.id;
  });
  afterAll(() => { context.cleanup(); rmSync(workspacePath, { recursive: true, force: true }); });

  async function openTurn(cid: string): Promise<AgentTurnInput> {
    const assistantMessageId = crypto.randomUUID();
    const now = new Date().toISOString();
    await createDatabase(context.bindings).insert(aiMessages).values({
      id: assistantMessageId,
      conversationId: cid,
      projectId,
      role: "assistant",
      content: "",
      citationsJson: "[]",
      model: null,
      status: "pending",
      error: "",
      createdAt: now,
    });
    return { projectId, conversationId: cid, assistantMessageId, message: "test", history: [] };
  }

  async function runAction(cid: string, action: Parameters<typeof executeWhitelistedAgentAction>[2]) {
    const turn = await openTurn(cid);
    const projectContext = await assembleProjectContext(context.bindings, projectId);
    expect(projectContext).toBeTruthy();
    return executeWhitelistedAgentAction(
      context.bindings,
      turn,
      action,
      projectContext!,
      "test-model",
      new Date().toISOString(),
    );
  }

  it("creates and lists a project-scoped conversation", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({}) }, context.bindings);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { conversation: { id: string; mode: string } };
    conversationId = body.conversation.id;
    expect(body.conversation.mode).toBe("research_agent");
    const listed = await app.request(`/api/projects/${projectId}/ai/conversations`, {}, context.bindings);
    expect(await listed.json()).toMatchObject({ conversations: [{ id: conversationId, status: "active" }] });
  });

  it("persists an allowlisted research-question draft action", async () => {
    const action = await runAction(conversationId, {
      tool: "research_question_create_draft",
      input: { question: "该方法能否稳定提升指标？", goal: "验证稳健性" },
    });
    expect(action).toMatchObject({ toolName: "research_question_create_draft", status: "completed" });

    const detail = await app.request(`/api/projects/${projectId}/ai/conversations/${conversationId}`, {}, context.bindings);
    const saved = await detail.json() as { actions: unknown[] };
    expect(saved.actions.length).toBeGreaterThanOrEqual(1);

    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const research = await thread.json() as { researchQuestions: Array<{ question: string; source: string }> };
    expect(research.researchQuestions).toContainEqual(expect.objectContaining({ question: "该方法能否稳定提升指标？", source: "ai" }));
  });

  it("cancels a conversation and rejects later turns", async () => {
    const cancelled = await app.request(`/api/projects/${projectId}/ai/conversations/${conversationId}/cancel`, { method: "POST" }, context.bindings);
    expect(cancelled.status).toBe(200);
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${conversationId}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "继续" }),
    }, context.bindings);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "CONVERSATION_CANCELLED" });
  });

  it("heals stale pending assistant rows when loading a conversation", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const staleId = crypto.randomUUID();
    await createDatabase(context.bindings).insert(aiMessages).values({
      id: staleId,
      conversationId: id,
      projectId,
      role: "assistant",
      content: "",
      citationsJson: "[]",
      model: null,
      status: "pending",
      error: "",
      createdAt: new Date(Date.now() - 120_000).toISOString(),
    });
    const detail = await app.request(`/api/projects/${projectId}/ai/conversations/${id}`, {}, context.bindings);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as { messages: Array<{ id: string; status: string; error: string }> };
    expect(body.messages.find((message) => message.id === staleId)).toMatchObject({
      status: "failed",
      error: "回合连接中断，请重试",
    });
  });

  it("stores a paper Diff proposal without applying it", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, {
      tool: "paper_patch_propose",
      input: {
        summary: "更新引言",
        proposedSource: "\\documentclass{article}\\begin{document}Evidence-based draft.\\end{document}",
        baseVersion: paperVersion,
        warnings: [],
      },
    });
    expect(action.output.href).toContain(`/writing?proposal=${action.id}`);
    const proposal = await app.request(`/api/projects/${projectId}/paper/proposals/${action.id}`, {}, context.bindings);
    expect(await proposal.json()).toMatchObject({ baseVersion: paperVersion, proposal: { summary: "更新引言" } });
    const unchanged = await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json() as { version: string };
    expect(unchanged.version).toBe(paperVersion);
  });

  it("creates a typed insight draft from the project conversation", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, {
      tool: "insight_create_draft",
      input: { type: "finding", title: "遮挡建模有效", summary: "项目证据显示遮挡建模值得进一步验证。", paperId: "agent-paper", evidenceIds: [] },
    });
    expect(action).toMatchObject({ toolName: "insight_create_draft", status: "completed" });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await thread.json() as { insights: Array<{ title: string; source: string; status: string }> };
    expect(payload.insights).toContainEqual(expect.objectContaining({ title: "遮挡建模有效", source: "ai", status: "draft" }));
  });

  it("saves a cited result-analysis draft and links it back to the research question", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, {
      tool: "result_analysis_create_draft",
      input: {
        experimentId: resultExperimentId,
        resultId,
        analysis: {
          summary: "方法组 AP 高于基线。",
          findings: [{ claim: "AP 提升", interpretation: "当前真实结果支持该判断", evidenceRefs: [{ row: 2, field: "ap" }] }],
          ablationFindings: [],
          anomalies: [],
          supportLevel: "supports",
          limitations: ["样本较少"],
          resultsDraft: "方法组在当前结果中取得更高 AP。",
        },
      },
    });
    expect(action).toMatchObject({ toolName: "result_analysis_create_draft", status: "completed", output: { resultId } });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await thread.json() as { researchQuestions: Array<{ id: string; conclusions: Array<{ resultId: string; supportLevel: string }> }> };
    expect(payload.researchQuestions.find((question) => question.id === resultRqId)?.conclusions)
      .toContainEqual(expect.objectContaining({ resultId, supportLevel: "supports" }));
  });

  it("links concrete project evidence to a research question", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, {
      tool: "research_question_link_evidence",
      input: { rqId: resultRqId, evidenceIds: [knowledgeId], stance: "supports", note: "直接支持研究问题" },
    });
    expect(action).toMatchObject({ toolName: "research_question_link_evidence", status: "completed", output: { linked: 1 } });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await thread.json() as { researchQuestions: Array<{ id: string; evidence: Array<{ knowledgeItemId: string; stance: string }> }> };
    expect(payload.researchQuestions.find((question) => question.id === resultRqId)?.evidence)
      .toContainEqual(expect.objectContaining({ knowledgeItemId: knowledgeId, stance: "supports" }));
  });

  it("appends a structured ablation to a planned experiment", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, {
      tool: "ablation_design_add",
      input: {
        experimentId: resultExperimentId,
        ablation: {
          name: "移除遮挡模块",
          change: "remove module",
          hypothesis: "验证模块贡献",
          control: "full model",
          fixedConditions: ["seed"],
          metrics: ["AP"],
          expectedDirection: "[预期] AP 下降",
        },
      },
    });
    expect(action).toMatchObject({ toolName: "ablation_design_add", status: "completed", output: { ablationCount: 1 } });
    const detail = await app.request(`/api/projects/${projectId}/experiments/${resultExperimentId}`, {}, context.bindings);
    expect(await detail.json()).toMatchObject({ experiment: { config: { ablations: [{ name: "移除遮挡模块" }] } } });
  });

  it("stores a bibliography proposal without changing references.bib", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, {
      tool: "bibliography_entry_propose",
      input: {
        citationKey: "doe2026",
        entry: "@article{doe2026,\n  title={Evidence Study},\n  author={Doe, Jane},\n  year={2026}\n}",
        baseVersion: bibliographyVersion,
      },
    });
    expect(action).toMatchObject({ toolName: "bibliography_entry_propose", output: { href: expect.stringContaining("file=references.bib") } });
    const proposal = await app.request(`/api/projects/${projectId}/paper/proposals/${action.id}`, {}, context.bindings);
    expect(await proposal.json()).toMatchObject({ toolName: "bibliography_entry_propose", baseVersion: bibliographyVersion, proposal: { proposedSource: expect.stringContaining("@article{doe2026") } });
    const unchanged = await (await app.request(`/api/projects/${projectId}/paper/bibliography`, {}, context.bindings)).json() as { version: string };
    expect(unchanged.version).toBe(bibliographyVersion);
  });

  it("runs only the allowlisted local LaTeX compile capability", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const action = await runAction(id, { tool: "latex_compile", input: {} });
    expect(action).toMatchObject({ toolName: "latex_compile", status: "completed", output: { status: "unavailable", href: expect.stringContaining("/writing") } });
  });

  it("records a recoverable failed message when AI is not configured", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "梳理证据" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: error");
    expect(text).toMatch(/AI_NOT_CONFIGURED/);
    const detail = await app.request(`/api/projects/${projectId}/ai/conversations/${id}`, {}, context.bindings);
    const saved = await detail.json() as { messages: Array<{ status: string }> };
    expect(saved.messages.map((message) => message.status)).toEqual(["completed", "failed"]);
  });

  it("deletes a conversation and its messages", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const deleted = await app.request(`/api/projects/${projectId}/ai/conversations/${id}`, { method: "DELETE" }, context.bindings);
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ id, deleted: true });
    const detail = await app.request(`/api/projects/${projectId}/ai/conversations/${id}`, {}, context.bindings);
    expect(detail.status).toBe(404);
    const missing = await app.request(`/api/projects/${projectId}/ai/conversations/missing`, { method: "DELETE" }, context.bindings);
    expect(missing.status).toBe(404);
  });
});

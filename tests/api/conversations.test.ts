// @vitest-environment node
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("persistent bounded Research Agent", () => {
  let context: TestContext;
  let fakeAi: Server;
  let conversationId = "";
  let actionKind: "question" | "insight" | "evidence" | "ablation" | "result" | "paper" | "bibliography" | "compile" = "question";
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
    fakeAi = createServer((_request, response) => {
      let action: unknown = { tool: "research_question_create_draft", input: { question: "该方法能否稳定提升指标？", goal: "验证稳健性" } };
      if (actionKind === "paper") action = { tool: "paper_patch_propose", input: { summary: "更新引言", proposedSource: "\\documentclass{article}\\begin{document}Evidence-based draft.\\end{document}", baseVersion: paperVersion, warnings: [] } };
      if (actionKind === "insight") action = { tool: "insight_create_draft", input: { type: "finding", title: "遮挡建模有效", summary: "项目证据显示遮挡建模值得进一步验证。", paperId: "agent-paper", evidenceIds: [] } };
      if (actionKind === "evidence") action = { tool: "research_question_link_evidence", input: { rqId: resultRqId, evidenceIds: [knowledgeId], stance: "supports", note: "直接支持研究问题" } };
      if (actionKind === "ablation") action = { tool: "ablation_design_add", input: { experimentId: resultExperimentId, ablation: { name: "移除遮挡模块", change: "remove module", hypothesis: "验证模块贡献", control: "full model", fixedConditions: ["seed"], metrics: ["AP"], expectedDirection: "[预期] AP 下降" } } };
      if (actionKind === "result") action = { tool: "result_analysis_create_draft", input: { experimentId: resultExperimentId, resultId, analysis: {
        summary: "方法组 AP 高于基线。", findings: [{ claim: "AP 提升", interpretation: "当前真实结果支持该判断", evidenceRefs: [{ row: 2, field: "ap" }] }],
        ablationFindings: [], anomalies: [], supportLevel: "supports", limitations: ["样本较少"], resultsDraft: "方法组在当前结果中取得更高 AP。",
      } } };
      if (actionKind === "bibliography") action = { tool: "bibliography_entry_propose", input: { citationKey: "doe2026", entry: "@article{doe2026,\n  title={Evidence Study},\n  author={Doe, Jane},\n  year={2026}\n}", baseVersion: bibliographyVersion } };
      if (actionKind === "compile") action = { tool: "latex_compile", input: {} };
      const output = {
        mode: "research_framer",
        reply: "现有证据支持形成一个待验证的问题。",
        citations: [
          { kind: "paper", id: "agent-paper", label: "真实论文" },
          { kind: "matrix", id: "agent-matrix", label: "方法对比矩阵" },
          { kind: "evidence", id: "agent-matrix:agent-dim:agent-paper", label: "矩阵证据" },
          { kind: "paper", id: "fabricated-paper", label: "虚构论文" },
        ],
        action,
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
    });
    await new Promise<void>((resolve) => fakeAi.listen(0, "127.0.0.1", resolve));
    context.bindings.STEPFUN_BASE_URL = `http://127.0.0.1:${(fakeAi.address() as AddressInfo).port}/v1`;
    context.bindings.STEPFUN_API_KEY = "test-key";
    context.bindings.STEPFUN_MODEL = "test-model";
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
  afterAll(() => { context.cleanup(); fakeAi.close(); rmSync(workspacePath, { recursive: true, force: true }); });

  it("creates and lists a project-scoped conversation", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({}) }, context.bindings);
    expect(created.status).toBe(201);
    conversationId = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const listed = await app.request(`/api/projects/${projectId}/ai/conversations`, {}, context.bindings);
    expect(await listed.json()).toMatchObject({ conversations: [{ id: conversationId, status: "active" }] });
  });

  it("persists messages and at most one allowlisted draft action", async () => {
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${conversationId}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "请基于证据创建一个研究问题草稿" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { message: { citations: Array<{ id: string }> }; action: { toolName: string; status: string } };
    expect(payload.message.citations).toEqual([
      expect.objectContaining({ id: "agent-paper" }),
      expect.objectContaining({ id: "agent-matrix", href: expect.stringContaining("/matrices/agent-matrix") }),
      expect.objectContaining({ id: "agent-matrix:agent-dim:agent-paper", href: expect.stringContaining("/matrices/agent-matrix") }),
    ]);
    expect(payload.action).toMatchObject({ toolName: "research_question_create_draft", status: "completed" });

    const detail = await app.request(`/api/projects/${projectId}/ai/conversations/${conversationId}`, {}, context.bindings);
    const saved = await detail.json() as { messages: Array<{ role: string; status: string }>; actions: unknown[] };
    expect(saved.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(saved.messages.every((message) => message.status === "completed")).toBe(true);
    expect(saved.actions).toHaveLength(1);

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

  it("stores a paper Diff proposal without applying it", async () => {
    actionKind = "paper";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "请生成论文引言 Diff" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { action: { id: string; output: { href: string } } };
    expect(payload.action.output.href).toContain(`/writing?proposal=${payload.action.id}`);
    const proposal = await app.request(`/api/projects/${projectId}/paper/proposals/${payload.action.id}`, {}, context.bindings);
    expect(await proposal.json()).toMatchObject({ baseVersion: paperVersion, proposal: { summary: "更新引言" } });
    const unchanged = await (await app.request(`/api/projects/${projectId}/paper/source`, {}, context.bindings)).json() as { version: string };
    expect(unchanged.version).toBe(paperVersion);
    actionKind = "question";
  });

  it("creates a typed insight draft from the project conversation", async () => {
    actionKind = "insight";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "请保存一条研究发现草稿" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: { toolName: "insight_create_draft", status: "completed" } });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await thread.json() as { insights: Array<{ title: string; source: string; status: string }> };
    expect(payload.insights).toContainEqual(expect.objectContaining({ title: "遮挡建模有效", source: "ai", status: "draft" }));
    actionKind = "question";
  });

  it("saves a cited result-analysis draft and links it back to the research question", async () => {
    actionKind = "result";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "请分析并保存这份真实实验结果" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: { toolName: "result_analysis_create_draft", status: "completed", output: { resultId } } });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await thread.json() as { researchQuestions: Array<{ id: string; conclusions: Array<{ resultId: string; supportLevel: string }> }> };
    expect(payload.researchQuestions.find((question) => question.id === resultRqId)?.conclusions)
      .toContainEqual(expect.objectContaining({ resultId, supportLevel: "supports" }));
    actionKind = "question";
  });

  it("links concrete project evidence to a research question", async () => {
    actionKind = "evidence";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "把这条证据关联到研究问题" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: { toolName: "research_question_link_evidence", status: "completed", output: { linked: 1 } } });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const payload = await thread.json() as { researchQuestions: Array<{ id: string; evidence: Array<{ knowledgeItemId: string; stance: string }> }> };
    expect(payload.researchQuestions.find((question) => question.id === resultRqId)?.evidence)
      .toContainEqual(expect.objectContaining({ knowledgeItemId: knowledgeId, stance: "supports" }));
    actionKind = "question";
  });

  it("appends a structured ablation to a planned experiment", async () => {
    actionKind = "ablation";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "追加一个消融实验草稿" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: { toolName: "ablation_design_add", status: "completed", output: { ablationCount: 1 } } });
    const detail = await app.request(`/api/projects/${projectId}/experiments/${resultExperimentId}`, {}, context.bindings);
    expect(await detail.json()).toMatchObject({ experiment: { config: { ablations: [{ name: "移除遮挡模块" }] } } });
    actionKind = "question";
  });

  it("stores a bibliography proposal without changing references.bib", async () => {
    actionKind = "bibliography";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "为这篇文献生成 BibTeX 条目提案" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { action: { id: string; toolName: string; output: { href: string } } };
    expect(payload.action).toMatchObject({ toolName: "bibliography_entry_propose", output: { href: expect.stringContaining("file=references.bib") } });
    const proposal = await app.request(`/api/projects/${projectId}/paper/proposals/${payload.action.id}`, {}, context.bindings);
    expect(await proposal.json()).toMatchObject({ toolName: "bibliography_entry_propose", baseVersion: bibliographyVersion, proposal: { proposedSource: expect.stringContaining("@article{doe2026") } });
    const unchanged = await (await app.request(`/api/projects/${projectId}/paper/bibliography`, {}, context.bindings)).json() as { version: string };
    expect(unchanged.version).toBe(bibliographyVersion);
    actionKind = "question";
  });

  it("runs only the allowlisted local LaTeX compile capability", async () => {
    actionKind = "compile";
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "编译当前论文" }),
    }, context.bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ action: { toolName: "latex_compile", status: "completed", output: { status: "unavailable", href: expect.stringContaining("/writing") } } });
    actionKind = "question";
  });

  it("records a recoverable failed message when AI is not configured", async () => {
    const created = await app.request(`/api/projects/${projectId}/ai/conversations`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    const id = ((await created.json()) as { conversation: { id: string } }).conversation.id;
    context.bindings.STEPFUN_BASE_URL = undefined; context.bindings.STEPFUN_API_KEY = undefined; context.bindings.STEPFUN_MODEL = undefined;
    const response = await app.request(`/api/projects/${projectId}/ai/conversations/${id}/messages`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ content: "梳理证据" }),
    }, context.bindings);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "AI_NOT_CONFIGURED", retryable: true });
    const detail = await app.request(`/api/projects/${projectId}/ai/conversations/${id}`, {}, context.bindings);
    const saved = await detail.json() as { messages: Array<{ status: string }> };
    expect(saved.messages.map((message) => message.status)).toEqual(["completed", "failed"]);
  });
});

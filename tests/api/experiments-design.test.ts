// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../../server/index";
import { createTestContext, jsonHeaders, type TestContext } from "./helpers";

describe("experiment design and real-result analysis", () => {
  let context: TestContext;
  let fakeAi: Server;
  let experimentId = "";
  let rqId = "";
  let invalidReferences = false;
  let returnDesign = false;
  const projectId = "experiment-design-project";

  beforeAll(async () => {
    context = await createTestContext();
    fakeAi = createServer((_request, response) => {
      if (returnDesign) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
          objective: "由 AI 生成主实验", hypothesis: "方法在统一条件下提升 AP", datasets: ["dataset-a"], baselines: ["baseline"],
          independentVariables: ["method"], dependentVariables: ["ap"], controlledVariables: ["seed"], metrics: ["AP"],
          procedure: ["统一设置比较"], successCriteria: ["AP 提升"], risks: ["样本量小"],
          ablations: [{ name: "移除模块", change: "remove module", hypothesis: "验证模块贡献", control: "full model", fixedConditions: ["seed"], metrics: ["AP"], expectedDirection: "[预期] AP 下降" }],
        }) } }] }));
        return;
      }
      const analysis = {
        summary: "ours 的 AP 高于 baseline。",
        findings: [{ claim: "AP 提升", interpretation: "在本批数据中观察到提升", evidenceRefs: [{ row: invalidReferences ? 99 : 2, field: "ap" }] }],
        ablationFindings: [], anomalies: [], supportLevel: "supports", limitations: ["仅有单次汇总数据"], resultsDraft: "在当前数据中，ours 的 AP 高于 baseline。",
      };
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(analysis) } }] }));
    });
    await new Promise<void>((resolve) => fakeAi.listen(0, "127.0.0.1", resolve));
    context.bindings.STEPFUN_BASE_URL = `http://127.0.0.1:${(fakeAi.address() as AddressInfo).port}/v1`;
    context.bindings.STEPFUN_API_KEY = "test-key";
    context.bindings.STEPFUN_MODEL = "test-model";
    await app.request(`/api/projects/${projectId}`, {
      method: "PUT", headers: jsonHeaders(), body: JSON.stringify({ name: "实验设计测试", description: "" }),
    }, context.bindings);
    const rqResponse = await app.request(`/api/projects/${projectId}/research-questions`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ question: "主方法是否提升 AP？", goal: "验证整体增益" }),
    }, context.bindings);
    rqId = ((await rqResponse.json()) as { researchQuestion: { id: string } }).researchQuestion.id;
  });

  afterAll(() => { context.cleanup(); fakeAi.close(); });

  it("creates a structured main and ablation design without execution", async () => {
    const response = await app.request(`/api/projects/${projectId}/experiments/design`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({
        title: "主实验", rqId, design: {
          objective: "比较方法", hypothesis: "ours 的 AP 更高", datasets: ["dataset-a"], baselines: ["baseline"],
          independentVariables: ["method"], dependentVariables: ["ap"], controlledVariables: ["seed"], metrics: ["AP"],
          procedure: ["统一设置比较"], successCriteria: ["AP 提升"], risks: ["样本量小"],
          ablations: [{ name: "移除模块", change: "remove module", hypothesis: "AP 下降", control: "full model", fixedConditions: ["seed"], metrics: ["AP"], expectedDirection: "[预期] AP 下降" }],
        },
      }),
    }, context.bindings);
    expect(response.status).toBe(201);
    const payload = await response.json() as { experiment: { id: string; config: { objective: string; ablations: unknown[] }; results: unknown[] } };
    experimentId = payload.experiment.id;
    expect(payload.experiment.config.objective).toBe("比较方法");
    expect(payload.experiment.config.ablations).toHaveLength(1);
    expect(payload.experiment.results).toEqual([]);
  });

  it("creates an AI-first design directly from a research question", async () => {
    const rqResponse = await app.request(`/api/projects/${projectId}/research-questions`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ question: "该模块是否提升 AP？", goal: "验证模块贡献" }),
    }, context.bindings);
    expect(rqResponse.status).toBe(201);
    const rq = await rqResponse.json() as { researchQuestion: { id: string } };
    returnDesign = true;
    const response = await app.request(`/api/projects/${projectId}/experiments/design-with-ai`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ rqId: rq.researchQuestion.id, constraints: "只使用公开数据集" }),
    }, context.bindings);
    returnDesign = false;
    expect(response.status).toBe(201);
    const payload = await response.json() as { experiment: { source: string; rqId: string; config: { objective: string; ablations: unknown[] } } };
    expect(payload.experiment).toMatchObject({ source: "ai", rqId: rq.researchQuestion.id });
    expect(payload.experiment.config.objective).toBe("由 AI 生成主实验");
    expect(payload.experiment.config.ablations).toHaveLength(1);
  });

  it("imports CSV while preserving raw text and normalized rows", async () => {
    const response = await app.request(`/api/projects/${projectId}/experiments/${experimentId}/results/import`, {
      method: "POST", headers: jsonHeaders(), body: JSON.stringify({ sourceType: "csv", sourceName: "results.csv", data: "method,ap\nbaseline,0.72\nours,0.79" }),
    }, context.bindings);
    expect(response.status).toBe(201);
    const payload = await response.json() as { result: { id: string; rawData: string; normalizedData: Array<Record<string, unknown>>; analysis: null } };
    expect(payload.result.rawData).toContain("baseline,0.72");
    expect(payload.result.normalizedData).toEqual([{ method: "baseline", ap: 0.72 }, { method: "ours", ap: 0.79 }]);
    expect(payload.result.analysis).toBeNull();
  });

  it("persists an analysis only when every row and field reference exists", async () => {
    const listed = await app.request(`/api/projects/${projectId}/experiments/${experimentId}`, {}, context.bindings);
    const before = await listed.json() as { experiment: { results: Array<{ id: string }> } };
    const resultId = before.experiment.results[0].id;
    invalidReferences = false;
    const response = await app.request(`/api/projects/${projectId}/experiments/${experimentId}/results/${resultId}/analyze`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    expect(response.status).toBe(200);
    const payload = await response.json() as { result: { analysisStatus: string; analysis: { findings: Array<{ evidenceRefs: unknown[] }> } } };
    expect(payload.result.analysisStatus).toBe("draft");
    expect(payload.result.analysis.findings[0].evidenceRefs).toEqual([{ row: 2, field: "ap" }]);
    const detail = await app.request(`/api/projects/${projectId}/experiments/${experimentId}/results/${resultId}`, {}, context.bindings);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({ result: { id: resultId, analysisStatus: "draft", analysis: { supportLevel: "supports" } } });
    const thread = await app.request(`/api/projects/${projectId}/research-thread`, {}, context.bindings);
    const threadPayload = await thread.json() as { researchQuestions: Array<{ id: string; conclusions: Array<{ resultId: string; supportLevel: string; status: string }> }>; stats: { conclusions: number } };
    const question = threadPayload.researchQuestions.find((item) => item.id === rqId);
    expect(question?.conclusions).toContainEqual(expect.objectContaining({ resultId, supportLevel: "supports", status: "draft" }));
    expect(threadPayload.stats.conclusions).toBe(1);
  });

  it("rejects invalid AI citations and leaves the previous analysis untouched", async () => {
    const listed = await app.request(`/api/projects/${projectId}/experiments/${experimentId}`, {}, context.bindings);
    const before = await listed.json() as { experiment: { results: Array<{ id: string }> } };
    const resultId = before.experiment.results[0].id;
    invalidReferences = true;
    const response = await app.request(`/api/projects/${projectId}/experiments/${experimentId}/results/${resultId}/analyze`, { method: "POST", headers: jsonHeaders(), body: "{}" }, context.bindings);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "AI_ANALYSIS_INVALID_REFERENCES" });
    invalidReferences = false;
  });
});

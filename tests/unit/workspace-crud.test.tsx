import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api";
import { useWorkspace, WorkspaceProvider } from "../../src/state/workspace";

interface HarnessApi {
  workspace: ReturnType<typeof useWorkspace>;
}

const Harness = ({ onReady }: { onReady: (api: HarnessApi) => void }) => {
  const workspace = useWorkspace();
  if (onReady) onReady({ workspace });
  return null;
};

describe("WorkspaceProvider CRUD", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.spyOn(api, "syncProject").mockResolvedValue({ id: "test-project" });
    vi.spyOn(api, "syncPaper").mockResolvedValue({ paperId: "test-paper", duplicate: false });
    vi.spyOn(api, "patchProject").mockResolvedValue({ project: {} as api.RemoteProject });
    vi.spyOn(api, "deletePaper").mockResolvedValue({ paperId: "test-paper", deleted: true });
    vi.spyOn(api, "removePaperFromProject").mockResolvedValue({ paperId: "test-paper", projectId: "test-project", removed: true });
    vi.spyOn(api, "deleteProject").mockResolvedValue({ id: "test-project", deleted: true });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("addProject returns id, stores locally", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let captured: ReturnType<typeof useWorkspace> | null = null;
    const root = createRoot(host);
    await act(async () => { root.render(<WorkspaceProvider><Harness onReady={({ workspace }) => { captured = workspace; }} /></WorkspaceProvider>); });
    let newId = "";
    await act(async () => { newId = captured!.addProject({ name: "新项目", description: "x" }); });
    expect(newId).toMatch(/^project-/);
    expect(captured!.projects.find((p) => p.id === newId)?.name).toBe("新项目");
    await act(async () => root.unmount());
  });

  it("deletePaper removes paper entirely and cleans linked local data", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let captured: ReturnType<typeof useWorkspace> | null = null;
    const root = createRoot(host);
    await act(async () => { root.render(<WorkspaceProvider><Harness onReady={({ workspace }) => { captured = workspace; }} /></WorkspaceProvider>); });
    let projectId = "";
    let paperId = "";
    await act(async () => {
      projectId = captured!.addProject({ name: "测试项目", description: "" });
      paperId = captured!.addPaper({ title: "待删除文献", authors: "", venue: "TestConf", year: 2026, projectIds: [projectId] });
      captured!.addKnowledge({ projectId, paperId, kind: "note", title: "n", content: "c", note: "", page: 1, source: "human", status: "draft" });
      captured!.addReaderAnswer({ projectId, paperId, page: 1, selection: "s", question: "q", answer: "a", model: "m", createdAt: "" });
    });
    expect(captured!.papers.find((p) => p.id === paperId)).toBeDefined();
    await act(async () => { captured!.deletePaper(paperId); });
    expect(captured!.papers.find((p) => p.id === paperId)).toBeUndefined();
    expect(captured!.projects.find((p) => p.id === projectId)!.paperIds).not.toContain(paperId);
    expect(captured!.knowledge.filter((k) => k.paperId === paperId)).toHaveLength(0);
    expect(captured!.readerAnswers.filter((a) => a.paperId === paperId)).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("removePaperFromProject only removes link from one project", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let captured: ReturnType<typeof useWorkspace> | null = null;
    const root = createRoot(host);
    await act(async () => { root.render(<WorkspaceProvider><Harness onReady={({ workspace }) => { captured = workspace; }} /></WorkspaceProvider>); });
    let projA = "";
    let projB = "";
    let paperId = "";
    await act(async () => {
      projA = captured!.addProject({ name: "项目 A", description: "" });
      projB = captured!.addProject({ name: "项目 B", description: "" });
      paperId = captured!.addPaper({ title: "多项目文献", authors: "", venue: "TestConf", year: 2026, projectIds: [projA, projB] });
    });
    expect(captured!.papers.find((p) => p.id === paperId)!.projectIds.sort()).toEqual([projA, projB].sort());
    await act(async () => { captured!.removePaperFromProject(paperId, projB); });
    expect(captured!.papers.find((p) => p.id === paperId)!.projectIds).toEqual([projA]);
    await act(async () => root.unmount());
  });

  it("updateProject changes name and description locally", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let captured: ReturnType<typeof useWorkspace> | null = null;
    const root = createRoot(host);
    await act(async () => { root.render(<WorkspaceProvider><Harness onReady={({ workspace }) => { captured = workspace; }} /></WorkspaceProvider>); });
    let projectId = "";
    await act(async () => { projectId = captured!.addProject({ name: "原名称", description: "原目标" }); });
    await act(async () => { captured!.updateProject(projectId, { name: "新名称", description: "新目标" }); });
    const updated = captured!.projects.find((p) => p.id === projectId)!;
    expect(updated.name).toBe("新名称");
    expect(updated.description).toBe("新目标");
    await act(async () => root.unmount());
  });

  it("deleteProject removes project, unlinks papers, drops matrices/ideas/knowledge/tasks", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let captured: ReturnType<typeof useWorkspace> | null = null;
    const root = createRoot(host);
    await act(async () => { root.render(<WorkspaceProvider><Harness onReady={({ workspace }) => { captured = workspace; }} /></WorkspaceProvider>); });
    let projA = "";
    let projB = "";
    let paperId = "";
    await act(async () => {
      projA = captured!.addProject({ name: "待删项目", description: "" });
      projB = captured!.addProject({ name: "保留项目", description: "" });
      paperId = captured!.addPaper({ title: "多项目文献", authors: "", venue: "T", year: 2026, projectIds: [projA, projB] });
      captured!.addMatrix({ projectId: projA, name: "矩阵", description: "", paperIds: [paperId], dimensionLabels: ["方法"] });
      captured!.addIdea({ title: "想法", summary: "s", projectId: projA });
      captured!.addKnowledge({ projectId: projA, paperId, kind: "note", title: "k", content: "c", note: "", page: 1, source: "human", status: "draft" });
      captured!.addTask({ projectId: projA, title: "t", detail: "d" });
    });
    expect(captured!.projects.find((p) => p.id === projA)).toBeTruthy();
    expect(captured!.matrices.find((m) => m.projectId === projA)).toBeTruthy();
    expect(captured!.ideas.find((i) => i.projectId === projA)).toBeTruthy();
    expect(captured!.knowledge.find((k) => k.projectId === projA)).toBeTruthy();
    expect(captured!.tasks.find((t) => t.projectId === projA)).toBeTruthy();

    await act(async () => { await captured!.deleteProject(projA); });

    expect(captured!.projects.find((p) => p.id === projA)).toBeUndefined();
    // 论文仍然存在,但不再关联到被删项目
    const paper = captured!.papers.find((p) => p.id === paperId)!;
    expect(paper.projectIds).toEqual([projB]);
    expect(captured!.projects.find((p) => p.id === projB)!.paperIds).toContain(paperId);
    // 依赖本地数据被清空
    expect(captured!.matrices.find((m) => m.projectId === projA)).toBeUndefined();
    expect(captured!.ideas.find((i) => i.projectId === projA)).toBeUndefined();
    expect(captured!.knowledge.find((k) => k.projectId === projA)).toBeUndefined();
    expect(captured!.tasks.find((t) => t.projectId === projA)).toBeUndefined();
    await act(async () => root.unmount());
  });
});

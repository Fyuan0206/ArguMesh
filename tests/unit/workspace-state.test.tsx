import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api";
import { useWorkspace, WorkspaceProvider, type LocalPaper, type LocalProject } from "../../src/state/workspace";

function Harness({ onCount }: { onCount: (count: number) => void }) {
  const workspace = useWorkspace();
  useEffect(() => {
    onCount(workspace.projects.length);
  }, [onCount, workspace.projects.length]);
  return <button onClick={() => workspace.addProject({ name: "测试项目", description: "持久化测试" })}>添加</button>;
}

function PaperHarness({ onData, projectId }: { onData: (data: { papers: LocalPaper[]; projects: LocalProject[] }) => void; projectId: string }) {
  const workspace = useWorkspace();
  useEffect(() => {
    onData({ papers: workspace.papers, projects: workspace.projects });
  }, [onData, workspace.papers, workspace.projects]);
  return <button onClick={() => workspace.addPaper({ title: "项目专属论文", authors: "Test Author", venue: "TestConf", year: 2026, projectIds: [projectId] })}>添加论文</button>;
}

function MatrixHarness({ onMatrixCount, projectId }: { onMatrixCount: (count: number) => void; projectId: string }) {
  const workspace = useWorkspace();
  useEffect(() => {
    onMatrixCount(workspace.matrices.length);
  }, [onMatrixCount, workspace.matrices.length]);
  return <button onClick={() => workspace.addMatrix({ projectId, name: "测试矩阵", description: "验证矩阵创建", paperIds: ["paper-a", "paper-b"], dimensionLabels: ["方法", "数据集"] })}>创建矩阵</button>;
}

describe("WorkspaceProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.spyOn(api, "syncProject").mockResolvedValue({ id: "test-project" });
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("adds a project and persists it in localStorage", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const counts: number[] = [];
    const root = createRoot(host);

    await act(async () => {
      root.render(<WorkspaceProvider><Harness onCount={(count) => counts.push(count)} /></WorkspaceProvider>);
    });
    await act(async () => host.querySelector("button")?.click());

    expect(counts.at(-1)).toBe(1);
    const stored = JSON.parse(window.localStorage.getItem("paperidea_workspace_v2_test-account") ?? "{}") as { projects?: Array<{ name: string }> };
    expect(stored.projects?.[0]?.name).toBe("测试项目");

    await act(async () => root.unmount());
  });

  it("restores persisted projects after the provider remounts", async () => {
    const storedProject = {
      id: "project-persisted",
      name: "重新登录后仍存在",
      description: "本地持久化项目",
      status: "active",
      paperIds: [],
      createdAt: "2026-08-13",
    };
    window.localStorage.setItem("paperidea_workspace_v1", JSON.stringify({ projects: [storedProject] }));

    const host = document.createElement("div");
    document.body.append(host);
    const counts: number[] = [];
    const root = createRoot(host);

    await act(async () => {
      root.render(<WorkspaceProvider><Harness onCount={(count) => counts.push(count)} /></WorkspaceProvider>);
    });

    expect(counts.at(-1)).toBe(1);
    expect(window.localStorage.getItem("paperidea_workspace_v2_test-account")).toContain("重新登录后仍存在");

    await act(async () => root.unmount());
  });

  it("merges cloud projects and drops unsynced local projects (cloud-first)", async () => {
    // 合并是 cloud-first 的刻意行为:本地存在但云端不存在的项目被视为已删除,
    // 与论文合并逻辑一致(workspace.tsx 的 filter 注释)。旧版测试断言"保留本地未同步项目",
    // 与当前实现矛盾,已按实现更新。ERR-20260814-001 附近排查时发现。
    window.sessionStorage.setItem("paperidea_access_token", "test-token");
    window.localStorage.setItem("paperidea_workspace_v1", JSON.stringify({
      projects: [{ id: "project-local", name: "本地待同步", description: "", status: "active", paperIds: [], createdAt: "2026-08-13" }],
    }));
    vi.spyOn(api, "listProjects").mockResolvedValue({
      projects: [{ id: "project-cloud", name: "云端项目", description: "已同步", extractionProgress: 0, createdAt: "2026-08-12T00:00:00.000Z", archived: false, archivedAt: null, sortOrder: 0, paperCount: 0 }],
    });
    vi.spyOn(api, "listPapersByProject").mockResolvedValue({ papers: [] });

    const host = document.createElement("div");
    document.body.append(host);
    const counts: number[] = [];
    const root = createRoot(host);

    await act(async () => {
      root.render(<WorkspaceProvider><Harness onCount={(count) => counts.push(count)} /></WorkspaceProvider>);
    });

    expect(api.listProjects).toHaveBeenCalledWith(true);
    expect(counts.at(-1)).toBe(1);
    const stored = window.localStorage.getItem("paperidea_workspace_v2_test-account") ?? "";
    expect(stored).toContain("云端项目");
    expect(stored).not.toContain("本地待同步");

    await act(async () => root.unmount());
  });

  it("pulls cloud papers into an empty local workspace (additive merge)", async () => {
    // ERR-20260814-003:旧实现只 filter+map 本地已有的论文,云端论文永远不会补进
    // 新浏览器/空本地工作区 → 项目文献库永远显示"当前项目没有匹配的文献"。
    window.sessionStorage.setItem("paperidea_access_token", "test-token");
    window.localStorage.setItem("paperidea_workspace_v2_test-account", JSON.stringify({ projects: [], papers: [], pendingSync: [] }));
    vi.spyOn(api, "listProjects").mockResolvedValue({
      projects: [{ id: "project-cloud", name: "云端项目", description: "", extractionProgress: 0, createdAt: "2026-08-12T00:00:00.000Z", archived: false, archivedAt: null, sortOrder: 0, paperCount: 3 }],
    });
    vi.spyOn(api, "listPapersByProject").mockResolvedValue({
      papers: [{
        id: "paper-a", title: "云端论文A", authors: "作者", venue: "未发表", year: 2026, shortName: "A",
        readingStatus: "待读", favorite: false, tags: [], abstract: null, doi: null, arxivId: null,
        sourceUrl: null, fileHash: null, hasFile: false, mimeType: null, fileSize: null, createdAt: "",
        archived: false, archivedAt: null, fileName: null, pageCount: null, outline: [],
      }],
    });

    const host = document.createElement("div");
    document.body.append(host);
    const papersSnapshot: Array<Array<{ id: string; title: string; projectIds: string[] }>> = [];
    const root = createRoot(host);
    function PaperHarness() {
      const workspace = useWorkspace();
      useEffect(() => {
        papersSnapshot.push(workspace.papers.map((p) => ({ id: p.id, title: p.title, projectIds: p.projectIds })));
      }, [workspace.papers]);
      return null;
    }

    await act(async () => {
      root.render(<WorkspaceProvider><PaperHarness /></WorkspaceProvider>);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(papersSnapshot.at(-1)).toEqual([{ id: "paper-a", title: "云端论文A", projectIds: ["project-cloud"] }]);
    const stored = JSON.parse(window.localStorage.getItem("paperidea_workspace_v2_test-account") ?? "{}") as { papers?: unknown[] };
    expect(stored.papers).toHaveLength(1);
    await act(async () => root.unmount());
  });

  it("keeps browser workspace data isolated by account", async () => {
    const chenHost = document.createElement("div");
    document.body.append(chenHost);
    const chenRoot = createRoot(chenHost);
    await act(async () => {
      chenRoot.render(<WorkspaceProvider accountId="chen-fuyuan"><Harness onCount={() => {}} /></WorkspaceProvider>);
    });
    await act(async () => chenHost.querySelector("button")?.click());
    await act(async () => chenRoot.unmount());

    const luoHost = document.createElement("div");
    document.body.append(luoHost);
    const luoCounts: number[] = [];
    const luoRoot = createRoot(luoHost);
    await act(async () => {
      luoRoot.render(<WorkspaceProvider accountId="luo-murong"><Harness onCount={(count) => luoCounts.push(count)} /></WorkspaceProvider>);
    });

    expect(luoCounts.at(-1)).toBe(0);
    expect(window.localStorage.getItem("paperidea_workspace_v2_chen-fuyuan")).toContain("测试项目");
    expect(window.localStorage.getItem("paperidea_workspace_v2_luo-murong")).not.toContain("测试项目");

    await act(async () => luoRoot.unmount());
  });

  it("links a new paper only to its selected project", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    let latest: { papers: LocalPaper[]; projects: LocalProject[] } | undefined;
    const root = createRoot(host);

    await act(async () => {
      root.render(<WorkspaceProvider><PaperHarness projectId="proj-only" onData={(data) => { latest = data; }} /></WorkspaceProvider>);
    });
    await act(async () => host.querySelector("button")?.click());

    const paper = latest?.papers.find((item) => item.title === "项目专属论文");
    expect(paper?.projectIds).toEqual(["proj-only"]);

    await act(async () => root.unmount());
  });

  it("creates and persists a project-scoped matrix with draft cells", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const counts: number[] = [];
    const root = createRoot(host);

    await act(async () => {
      root.render(<WorkspaceProvider><MatrixHarness projectId="proj-mat" onMatrixCount={(count) => counts.push(count)} /></WorkspaceProvider>);
    });
    await act(async () => host.querySelector("button")?.click());

    expect(counts.at(-1)).toBe(1);
    const stored = JSON.parse(window.localStorage.getItem("paperidea_workspace_v2_test-account") ?? "{}") as { matrices?: Array<{ name: string; projectId: string; paperIds: string[]; dimensions: unknown[]; cells: Record<string, { status: string }> }> };
    const matrix = stored.matrices?.find((item) => item.name === "测试矩阵");
    expect(matrix?.projectId).toBe("proj-mat");
    expect(matrix?.paperIds).toEqual(["paper-a", "paper-b"]);
    expect(matrix?.dimensions).toHaveLength(2);
    expect(Object.values(matrix?.cells ?? {})).toHaveLength(4);
    expect(Object.values(matrix?.cells ?? {}).every((cell) => cell.status === "draft")).toBe(true);

    await act(async () => root.unmount());
  });
});

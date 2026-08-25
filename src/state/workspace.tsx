import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as api from "../api";

/**
 * 后台同步队列:本地状态先写,API 调用失败时入队,顶部横幅提示重试。
 * 队列条目最多保留 50 条,FIFO。组件订阅 `pendingSync` 即可显示提示。
 */
export interface PendingSyncEntry {
  id: string;
  label: string;
  error: string;
  retry: () => Promise<void>;
  createdAt: string;
}

export type ReadingStatus = "待读" | "粗读" | "精读" | "核心文献";
export type IdeaStatus = "Inbox" | "Draft" | "Reviewing" | "Revise" | "Approved" | "Experimenting" | "Writing" | "Archived";
export type KnowledgeKind = "note" | "claim" | "evidence";

export interface LocalProject {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  paperIds: string[];
  createdAt: string;
}

export interface LocalPaper {
  id: string;
  title: string;
  authors: string;
  venue: string;
  year: number;
  status: ReadingStatus;
  tags: string[];
  projectIds: string[];
  abstract?: string;
  doi?: string;
  arxivId?: string;
  sourceUrl?: string;
  fileHash?: string;
  favorite?: boolean;
  fileName?: string;
  fileSize?: number;
  pageCount?: number;
  outline?: Array<{ title: string; page: number }>;
  card?: PaperCard;
}

export interface PaperCardSources {
  problem: string;
  method: string;
  data: string;
  findings: string;
  limitations: string;
}

export interface PaperCard {
  problem: string;
  method: string;
  data: string;
  findings: string;
  limitations: string;
  confirmed: boolean;
  updatedAt: string;
  /** AI 生成元信息(来源模型/时间/文本来源/逐字段原文依据)。人工手写卡片无这些字段。 */
  generatedBy?: string;
  generatedAt?: string;
  generatedSource?: string;
  sources?: PaperCardSources;
}

export interface ReaderAnswer {
  id: string;
  projectId: string;
  paperId: string;
  page: number;
  selection: string;
  question: string;
  answer: string;
  model: string;
  createdAt: string;
}

export interface ReaderExcerpt {
  id: string;
  projectId: string;
  paperId: string;
  page: number;
  text: string;
  note: string;
  kind: "note" | "evidence" | "highlight";
  color?: string;
  createdAt: string;
}

export interface ReaderPosition {
  projectId: string;
  paperId: string;
  page: number;
  scale: number;
  updatedAt: string;
}

export interface LocalMatrixDimension {
  id: string;
  label: string;
}

export interface LocalMatrixCell {
  value: string;
  status: "draft" | "confirmed" | "conflict" | "missing";
  confidence: number;
  claim: string;
  sourcePage: string;
  sourceSection: string;
  sourceExcerpt: string;
  locked: boolean;
}

export interface LocalMatrix {
  id: string;
  projectId: string;
  name: string;
  description: string;
  paperIds: string[];
  dimensions: LocalMatrixDimension[];
  cells: Record<string, LocalMatrixCell>;
  source: "server" | "local";
  createdAt: string;
}

export interface LocalIdea {
  id: string;
  title: string;
  summary: string;
  projectId: string;
  status: IdeaStatus;
  evidenceCount: number;
  createdAt: string;
  canvas: IdeaCanvas;
  evidenceIds: string[];
  versions: IdeaVersion[];
}

export interface IdeaCanvas {
  problem: string;
  gap: string;
  hypothesis: string;
  method: string;
  experiment: string;
  risks: string;
}

export interface IdeaVersion {
  id: string;
  createdAt: string;
  summary: string;
  canvas: IdeaCanvas;
}

export interface KnowledgeItem {
  id: string;
  projectId: string;
  paperId: string;
  kind: KnowledgeKind;
  title: string;
  content: string;
  note: string;
  page: number;
  source: "human" | "ai";
  status: "draft" | "confirmed";
  createdAt: string;
}

export interface WorkspaceTask {
  id: string;
  projectId: string;
  title: string;
  detail: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  model: string;
  createdAt: string;
}

export interface TrashItem {
  id: string;
  kind: "knowledge" | "idea";
  label: string;
  payload: KnowledgeItem | LocalIdea;
  deletedAt: string;
}

export interface WorkspaceSettings {
  displayName: string;
  provider: string;
  model: string;
  autoSave: boolean;
  evidenceFirst: boolean;
}

interface WorkspaceData {
  projects: LocalProject[];
  papers: LocalPaper[];
  matrices: LocalMatrix[];
  ideas: LocalIdea[];
  settings: WorkspaceSettings;
  readerAnswers: ReaderAnswer[];
  readerExcerpts: ReaderExcerpt[];
  readerPositions: ReaderPosition[];
  knowledge: KnowledgeItem[];
  tasks: WorkspaceTask[];
  trash: TrashItem[];
  pendingSync: PendingSyncEntry[];
}

export type NewPaperInput = Pick<LocalPaper, "title" | "authors" | "venue" | "year" | "projectIds"> &
  Partial<Pick<LocalPaper, "abstract" | "doi" | "arxivId" | "sourceUrl" | "fileHash" | "fileName" | "fileSize" | "pageCount" | "outline">>;

interface WorkspaceContextValue extends WorkspaceData {
  addProject: (input: Pick<LocalProject, "name" | "description">) => string;
  updateProject: (projectId: string, updates: Partial<Pick<LocalProject, "name" | "description">>) => void;
  /**
   * 删除项目并清理所有依赖本地状态:从每个 paper 的 projectIds 中移除该项目,
   * 移除与该项目绑定的 matrices、ideas、reader 关联,以及 knowledge / tasks / trash。
   * 本地立即生效,云端 API 通过 runSync 异步调用;若 API 返回 404(已删除)视为成功。
   */
  deleteProject: (projectId: string, options?: { force?: boolean }) => Promise<void>;
  addPaper: (input: NewPaperInput) => string;
  updatePaper: (paperId: string, updates: Partial<Omit<LocalPaper, "id" | "projectIds">>) => void;
  setPaperTags: (paperId: string, tags: string[]) => void;
  togglePaperFavorite: (paperId: string) => void;
  setReadingStatus: (paperId: string, status: ReadingStatus) => void;
  togglePaperProject: (paperId: string, projectId: string) => void;
  setPaperFile: (paperId: string, file: { name: string; size: number }) => void;
  removePaperFromProject: (paperId: string, projectId: string) => void;
  deletePaper: (paperId: string) => void;
  addMatrix: (input: { projectId: string; name: string; description: string; paperIds: string[]; dimensionLabels: string[] }) => string;
  updateMatrixCell: (matrixId: string, cellKey: string, status: LocalMatrixCell["status"], locked: boolean) => void;
  markMatrixSynced: (matrixId: string) => void;
  addIdea: (input: Pick<LocalIdea, "title" | "summary" | "projectId">) => void;
  setIdeaStatus: (ideaId: string, status: IdeaStatus) => void;
  updateIdea: (ideaId: string, updates: { title?: string; summary?: string; canvas?: IdeaCanvas; evidenceIds?: string[] }) => void;
  restoreIdeaVersion: (ideaId: string, versionId: string) => void;
  deleteIdea: (ideaId: string) => void;
  addKnowledge: (input: Omit<KnowledgeItem, "id" | "createdAt">) => string;
  updateKnowledge: (itemId: string, updates: Partial<Pick<KnowledgeItem, "title" | "content" | "note" | "kind" | "status">>) => void;
  deleteKnowledge: (itemId: string) => void;
  addTask: (input: Pick<WorkspaceTask, "projectId" | "title" | "detail"> & Partial<Pick<WorkspaceTask, "model">>) => string;
  updateTask: (taskId: string, updates: Partial<Pick<WorkspaceTask, "status" | "progress" | "detail">>) => void;
  clearFinishedTasks: () => void;
  restoreTrashItem: (trashId: string) => void;
  permanentlyDeleteTrashItem: (trashId: string) => void;
  importWorkspace: (input: string) => { ok: true } | { ok: false; error: string };
  exportWorkspace: () => string;
  updateSettings: (settings: Partial<WorkspaceSettings>) => void;
  addReaderAnswer: (answer: Omit<ReaderAnswer, "id">) => void;
  addReaderExcerpt: (excerpt: Omit<ReaderExcerpt, "id" | "createdAt">) => void;
  updateReaderExcerpt: (excerptId: string, updates: Pick<ReaderExcerpt, "note" | "color">) => void;
  deleteReaderExcerpt: (excerptId: string) => void;
  setReaderPosition: (position: Omit<ReaderPosition, "updatedAt">) => void;
  retrySync: (entryId: string) => Promise<void>;
  dismissSync: (entryId: string) => void;
  dismissAllSync: () => void;
  resetLocalData: () => void;
}

const LEGACY_STORAGE_KEY = "paperidea_workspace_v1";
// 单用户本地版:存储键固定,不再按账号分。
const WORKSPACE_STORAGE_KEY = "paperidea_workspace_v2_local";
const EMPTY_CANVAS: IdeaCanvas = { problem: "", gap: "", hypothesis: "", method: "", experiment: "", risks: "" };

const initialData: WorkspaceData = {
  projects: [],
  papers: [],
  matrices: [],
  ideas: [],
  settings: { displayName: "", provider: "", model: "", autoSave: true, evidenceFirst: true },
  readerAnswers: [],
  readerExcerpts: [],
  readerPositions: [],
  knowledge: [],
  tasks: [],
  trash: [],
  pendingSync: [],
};

function createId(prefix: string) {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function readStoredData(storageKey: string, migrateLegacy: boolean): WorkspaceData {
  window.localStorage.removeItem("paperidea_workspace");
  try {
    const value = window.localStorage.getItem(storageKey)
      ?? (migrateLegacy ? window.localStorage.getItem(LEGACY_STORAGE_KEY) : null);
    if (!value) return initialData;
    const stored = JSON.parse(value) as Partial<WorkspaceData>;
    return {
      ...initialData,
      ...stored,
      projects: stored.projects ?? initialData.projects,
      papers: (stored.papers ?? initialData.papers).map((paper) => ({ ...paper, favorite: paper.favorite ?? false })),
      matrices: (stored.matrices ?? initialData.matrices).map((matrix) => ({ ...matrix, source: matrix.source ?? "local" })),
      ideas: (stored.ideas ?? initialData.ideas).map((idea) => ({ ...idea, canvas: { ...EMPTY_CANVAS, ...idea.canvas }, evidenceIds: idea.evidenceIds ?? [], versions: idea.versions ?? [], evidenceCount: idea.evidenceIds?.length ?? idea.evidenceCount ?? 0 })),
      settings: { ...initialData.settings, ...stored.settings },
      readerAnswers: stored.readerAnswers ?? [],
      readerExcerpts: stored.readerExcerpts ?? [],
      readerPositions: stored.readerPositions ?? [],
      knowledge: stored.knowledge ?? [],
      tasks: stored.tasks ?? [],
      trash: stored.trash ?? [],
      pendingSync: stored.pendingSync ?? [],
    };
  } catch {
    return initialData;
  }
}

function mergeRemoteProjects(localProjects: LocalProject[], remoteProjects: api.RemoteProject[]): LocalProject[] {
  const localById = new Map(localProjects.map((project) => [project.id, project]));
  const remoteIds = new Set(remoteProjects.map((project) => project.id));
  // 归档概念已从前端移除(归档=删除):云端已归档的项目视为不存在,不合并进本地。
  remoteProjects = remoteProjects.filter((project) => !project.archived);
  const syncedProjects = remoteProjects.map((project) => {
    const local = localById.get(project.id);
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.archived ? "archived" as const : "active" as const,
      paperIds: local?.paperIds ?? [],
      createdAt: local?.createdAt ?? project.createdAt.slice(0, 10),
    };
  });
  return [...syncedProjects, ...localProjects.filter((project) => !remoteIds.has(project.id))];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const storageKey = WORKSPACE_STORAGE_KEY;
  const [data, setData] = useState<WorkspaceData>(() => readStoredData(storageKey, true));

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(data));
  }, [data, storageKey]);

  useEffect(() => {
    // 单用户本地版:无鉴权,直接同步本地工作区与本地 API。
    let cancelled = false;
    api.listProjects(true).then(async ({ projects }) => {
      if (cancelled) return;
      // 1) 把云端项目合并进来,同时丢弃本地已删除的项目(offline-first 在这里让步给一致性)。
      const remoteProjectIds = new Set(projects.map((p) => p.id));
      setData((current) => ({
        ...current,
        projects: mergeRemoteProjects(current.projects, projects).filter((p) => remoteProjectIds.has(p.id)),
      }));
      // 2) 拉每个云端项目的 paper 列表。云端返回的 papers 是该账号下真实存在的集合;
      //    共享 paper 会出现在多个项目的返回里,合并时保留。
      const paperMap = new Map<string, { paper: api.RemotePaper; projectIds: string[] }>();
      await Promise.all(projects.map(async (project) => {
        try {
          const { papers } = await api.listPapersByProject(project.id);
          for (const paper of papers) {
            // 归档概念已移除:云端已归档的论文视为不存在。
            if (paper.archived) continue;
            const existing = paperMap.get(paper.id);
            if (existing) {
              if (!existing.projectIds.includes(project.id)) existing.projectIds.push(project.id);
            } else {
              paperMap.set(paper.id, { paper, projectIds: [project.id] });
            }
          }
        } catch {
          // 单个项目失败不阻塞其他项目
        }
      }));
      if (cancelled) return;
      // 拉取失败(paperMap 为空,比如全部项目请求被网络打断)时保留本地现状,
      // 不要把本地论文误删。ERR-20260814-003。
      if (paperMap.size === 0) return;
      setData((current) => {
        const localById = new Map(current.papers.map((paper) => [paper.id, paper]));
        // 云端为准合并:本地已有的用云端元数据覆盖,云端新增的论文也补进本地
        // (旧实现只 filter+map 本地已有项,云端论文永远不会出现在新浏览器里)。
        // 本地独有的字段(card 等)保留。ERR-20260814-003。
        const merged = [...paperMap.values()].map(({ paper, projectIds }) => {
          const local = localById.get(paper.id);
          return {
            id: paper.id,
            title: paper.title,
            authors: paper.authors,
            venue: paper.venue,
            year: paper.year,
            status: (paper.readingStatus as ReadingStatus) ?? local?.status ?? "待读",
            tags: paper.tags ?? [],
            projectIds,
            favorite: paper.favorite ?? local?.favorite ?? false,
            abstract: paper.abstract ?? local?.abstract,
            doi: paper.doi ?? local?.doi,
            arxivId: paper.arxivId ?? local?.arxivId,
            sourceUrl: paper.sourceUrl ?? local?.sourceUrl,
            fileHash: paper.fileHash ?? local?.fileHash,
            fileName: paper.fileName ?? local?.fileName,
            fileSize: paper.fileSize ?? local?.fileSize,
            pageCount: paper.pageCount ?? local?.pageCount,
            outline: paper.outline?.length ? paper.outline : local?.outline,
            card: local?.card,
          };
        });
        return { ...current, papers: merged };
      });
    }).catch(() => {
      // 本地工作区仍可使用；下次登录或刷新时会再次尝试从云端恢复。
    });
    return () => { cancelled = true; };
  }, []);

  /**
   * 把一条失败的后台同步任务入队,等待用户在横幅处重试。
   * 队列最多保留 50 条,FIFO,新条目追加到末尾。
   */
  const enqueueSync = (label: string, retry: () => Promise<void>, error: string) => {
    const entry: PendingSyncEntry = { id: createId("sync"), label, error, retry, createdAt: new Date().toISOString() };
    setData((current) => ({ ...current, pendingSync: [...current.pendingSync, entry].slice(-50) }));
  };

  /**
   * 判断一个同步错误是否意味着"云端目标状态已达成或已不存在"。
   * 与 deleteProject 的 404 容忍一致:论文/项目/关联在云端不存在时,
   * 本地副本本来就会被 cloud-first 合并清掉,重试永远不可能成功,
   * 所以不打扰用户,直接视为成功。见 ERR-20260814-001。
   */
  const isAlreadyResolved = (error: unknown): boolean => {
    const message = error instanceof Error ? error.message : String(error);
    return /论文不存在|项目不存在|未关联到此项目|PAPER_NOT_FOUND|LINK_NOT_FOUND|请求失败 \(404\)/.test(message);
  };

  /** 静默后台运行:不阻塞 UI,失败时入队(云端已不存在的目标不打扰用户)。 */
  const runSync = (label: string, task: () => Promise<void>) => {
    task().catch((error: unknown) => {
      if (isAlreadyResolved(error)) return;
      enqueueSync(label, () => task(), error instanceof Error ? error.message : "同步失败");
    });
  };

  const value = useMemo<WorkspaceContextValue>(() => ({
    ...data,
    addProject(input) {
      const id = createId("project");
      const project: LocalProject = { id, ...input, status: "active", paperIds: [], createdAt: new Date().toISOString().slice(0, 10) };
      setData((current) => ({ ...current, projects: [project, ...current.projects] }));
      runSync(`创建项目「${input.name}」`, async () => {
        await api.syncProject({ id, name: input.name, description: input.description });
      });
      return id;
    },
    updateProject(projectId, updates) {
      setData((current) => ({
        ...current,
        projects: current.projects.map((project) => project.id === projectId ? { ...project, ...updates } : project),
      }));
      const project = data.projects.find((item) => item.id === projectId);
      if (project) {
        runSync(`更新项目「${project.name}」`, async () => {
          await api.patchProject(projectId, { name: updates.name ?? project.name, description: updates.description ?? project.description });
        });
      }
    },
    async deleteProject(projectId, options) {
      const project = data.projects.find((item) => item.id === projectId);
      const projectName = project?.name ?? projectId;
      // 本地立即清空,避免页面看到已删除项目的残留数据。
      setData((current) => ({
        ...current,
        projects: current.projects.filter((item) => item.id !== projectId),
        papers: current.papers.map((paper) => paper.projectIds.includes(projectId) ? { ...paper, projectIds: paper.projectIds.filter((id) => id !== projectId) } : paper),
        matrices: current.matrices.filter((matrix) => matrix.projectId !== projectId),
        ideas: current.ideas.filter((idea) => idea.projectId !== projectId),
        knowledge: current.knowledge.filter((item) => item.projectId !== projectId),
        readerAnswers: current.readerAnswers.filter((item) => item.projectId !== projectId),
        readerExcerpts: current.readerExcerpts.filter((item) => item.projectId !== projectId),
        readerPositions: current.readerPositions.filter((item) => item.projectId !== projectId),
        tasks: current.tasks.filter((task) => task.projectId !== projectId),
      }));
      try {
        // 后端响应里包含 deletedPaperIds——只删那些独占 paperId 的 papers;
        // shared papers 仍然挂在别的项目下,保留它们的本地副本是正确的。
        const response = await api.deleteProject(projectId, { force: options?.force });
        const deletedPaperIds = (response as { deletedPaperIds?: string[] }).deletedPaperIds ?? [];
        if (deletedPaperIds.length > 0) {
          setData((current) => ({
            ...current,
            papers: current.papers.filter((paper) => !deletedPaperIds.includes(paper.id)),
          }));
        }
        return;
      } catch (error) {
        // 404 通常意味着云端早已被删除(可能是另一个标签页/多设备),不视作失败。
        // 此时 force=true 的语义下,我们乐观地认为后端早先已清掉独占 papers;
        // 但因为无法知道哪些 paperIds 真删了,只清 projectId 关联、不动 paper 本体,
        // 用户下次进入该项目时会被 EmptyState 引导。
        const message = error instanceof Error ? error.message : String(error);
        if (!/项目不存在|404/.test(message)) {
          enqueueSync(`删除项目「${projectName}」`, async () => { await api.deleteProject(projectId, { force: true }); }, message);
        }
      }
    },
    addPaper(input) {
      const canonicalTitle = input.title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ");
      const duplicate = data.papers.find((paper) =>
        (input.fileHash && paper.fileHash === input.fileHash)
        || (input.doi && paper.doi?.toLowerCase() === input.doi.toLowerCase())
        || (input.arxivId && paper.arxivId?.toLowerCase() === input.arxivId.toLowerCase())
        || paper.title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ") === canonicalTitle,
      );
      if (duplicate) {
        setData((current) => ({
          ...current,
          papers: current.papers.map((paper) => paper.id === duplicate.id
            ? { ...paper, ...Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")), projectIds: [...new Set([...paper.projectIds, ...input.projectIds])] }
            : paper),
          projects: current.projects.map((project) => input.projectIds.includes(project.id) && !project.paperIds.includes(duplicate.id)
            ? { ...project, paperIds: [...project.paperIds, duplicate.id] }
            : project),
        }));
        return duplicate.id;
      }
      const paper: LocalPaper = { id: createId("paper"), ...input, status: "待读", tags: [], favorite: false };
      setData((current) => ({
        ...current,
        papers: [paper, ...current.papers],
        projects: current.projects.map((project) => paper.projectIds.includes(project.id) ? { ...project, paperIds: [...project.paperIds, paper.id] } : project),
      }));
      return paper.id;
    },
    updatePaper(paperId, updates) {
      setData((current) => ({ ...current, papers: current.papers.map((paper) => paper.id === paperId ? { ...paper, ...updates } : paper) }));
      const paper = data.papers.find((item) => item.id === paperId);
      if (paper) {
        const patch: Parameters<typeof api.patchPaper>[1] = {};
        if (updates.title !== undefined) patch.title = updates.title;
        if (updates.authors !== undefined) patch.authors = updates.authors;
        if (updates.venue !== undefined) patch.venue = updates.venue;
        if (updates.year !== undefined) patch.year = updates.year;
        if (updates.abstract !== undefined) patch.abstract = updates.abstract;
        if (updates.doi !== undefined) patch.doi = updates.doi;
        if (updates.arxivId !== undefined) patch.arxivId = updates.arxivId;
        if (updates.sourceUrl !== undefined) patch.sourceUrl = updates.sourceUrl;
        if (Object.keys(patch).length > 0) {
          runSync(`更新文献「${paper.title}」`, async () => { await api.patchPaper(paperId, patch); });
        }
      }
    },
    setPaperTags(paperId, tags) {
      const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
      setData((current) => ({ ...current, papers: current.papers.map((paper) => paper.id === paperId ? { ...paper, tags: normalized } : paper) }));
      runSync(`更新文献标签`, async () => { await api.patchPaper(paperId, { tags: normalized }); });
    },
    togglePaperFavorite(paperId) {
      const paper = data.papers.find((item) => item.id === paperId);
      const nextFavorite = !paper?.favorite;
      setData((current) => ({ ...current, papers: current.papers.map((paper) => paper.id === paperId ? { ...paper, favorite: !paper.favorite } : paper) }));
      runSync(`${nextFavorite ? "收藏" : "取消收藏"}文献`, async () => { await api.patchPaper(paperId, { favorite: nextFavorite }); });
    },
    setReadingStatus(paperId, status) {
      setData((current) => ({ ...current, papers: current.papers.map((paper) => paper.id === paperId ? { ...paper, status } : paper) }));
      runSync(`更新阅读状态为「${status}」`, async () => { await api.patchPaper(paperId, { readingStatus: status }); });
    },
    togglePaperProject(paperId, projectId) {
      setData((current) => {
        const paper = current.papers.find((item) => item.id === paperId);
        const linked = paper?.projectIds.includes(projectId) ?? false;
        return {
          ...current,
          papers: current.papers.map((item) => item.id === paperId ? { ...item, projectIds: linked ? item.projectIds.filter((id) => id !== projectId) : [...item.projectIds, projectId] } : item),
          projects: current.projects.map((project) => project.id === projectId ? { ...project, paperIds: linked ? project.paperIds.filter((id) => id !== paperId) : [...project.paperIds, paperId] } : project),
        };
      });
    },
    setPaperFile(paperId, file) {
      setData((current) => ({
        ...current,
        papers: current.papers.map((paper) => paper.id === paperId ? { ...paper, fileName: file.name, fileSize: file.size } : paper),
      }));
    },
    removePaperFromProject(paperId, projectId) {
      setData((current) => ({
        ...current,
        papers: current.papers.map((paper) => paper.id === paperId ? { ...paper, projectIds: paper.projectIds.filter((id) => id !== projectId) } : paper),
        projects: current.projects.map((project) => project.id === projectId ? { ...project, paperIds: project.paperIds.filter((id) => id !== paperId) } : project),
      }));
      runSync(`从项目移除文献`, async () => { await api.removePaperFromProject(paperId, projectId); });
    },
    /** 物理删除论文(替代旧"归档"):本地立即移除并清理关联数据,云端同步删除。 */
    deletePaper(paperId) {
      setData((current) => ({
        ...current,
        papers: current.papers.filter((paper) => paper.id !== paperId),
        projects: current.projects.map((project) => ({ ...project, paperIds: project.paperIds.filter((id) => id !== paperId) })),
        knowledge: current.knowledge.filter((item) => item.paperId !== paperId),
        readerAnswers: current.readerAnswers.filter((item) => item.paperId !== paperId),
        readerExcerpts: current.readerExcerpts.filter((item) => item.paperId !== paperId),
        readerPositions: current.readerPositions.filter((item) => item.paperId !== paperId),
      }));
      runSync(`删除文献`, async () => { await api.deletePaper(paperId); });
    },
    addMatrix(input) {
      const id = createId("matrix");
      const dimensions = input.dimensionLabels.map((label, index) => ({ id: `${id}:dimension-${index + 1}`, label }));
      const cells = Object.fromEntries(dimensions.flatMap((dimension) => input.paperIds.map((paperId) => [`${dimension.id}:${paperId}`, {
        value: "待提取",
        status: "draft" as const,
        confidence: 0,
        claim: "尚未从论文原文中提取该维度。",
        sourcePage: "—",
        sourceSection: "待提取",
        sourceExcerpt: "运行 AI 提取或阅读原文后补充证据。",
        locked: false,
      }])));
      const matrix: LocalMatrix = { id, ...input, dimensions, cells, source: "local", createdAt: new Date().toISOString().slice(0, 10) };
      setData((current) => ({ ...current, matrices: [matrix, ...current.matrices] }));
      return id;
    },
    updateMatrixCell(matrixId, cellKey, status, locked) {
      setData((current) => ({
        ...current,
        matrices: current.matrices.map((matrix) => matrix.id === matrixId && matrix.cells[cellKey]
          ? { ...matrix, cells: { ...matrix.cells, [cellKey]: { ...matrix.cells[cellKey], status, locked } } }
          : matrix),
      }));
    },
    markMatrixSynced(matrixId) {
      setData((current) => ({ ...current, matrices: current.matrices.map((matrix) => matrix.id === matrixId ? { ...matrix, source: "server" } : matrix) }));
    },
    addIdea(input) {
      setData((current) => ({ ...current, ideas: [{ id: createId("idea"), ...input, status: "Inbox", evidenceCount: 0, createdAt: new Date().toISOString().slice(0, 10), canvas: { ...EMPTY_CANVAS }, evidenceIds: [], versions: [] }, ...current.ideas] }));
    },
    setIdeaStatus(ideaId, status) {
      setData((current) => ({ ...current, ideas: current.ideas.map((idea) => idea.id === ideaId ? { ...idea, status } : idea) }));
    },
    updateIdea(ideaId, updates) {
      setData((current) => ({
        ...current,
        ideas: current.ideas.map((idea) => {
          if (idea.id !== ideaId) return idea;
          const nextCanvas = updates.canvas ?? idea.canvas;
          const changed = updates.summary !== undefined || updates.canvas !== undefined;
          const version: IdeaVersion = { id: createId("version"), createdAt: new Date().toISOString(), summary: idea.summary, canvas: idea.canvas };
          const evidenceIds = updates.evidenceIds ?? idea.evidenceIds;
          return { ...idea, ...updates, canvas: nextCanvas, evidenceIds, evidenceCount: evidenceIds.length, versions: changed ? [version, ...idea.versions].slice(0, 30) : idea.versions };
        }),
      }));
    },
    restoreIdeaVersion(ideaId, versionId) {
      setData((current) => ({ ...current, ideas: current.ideas.map((idea) => {
        if (idea.id !== ideaId) return idea;
        const version = idea.versions.find((item) => item.id === versionId);
        if (!version) return idea;
        const currentVersion: IdeaVersion = { id: createId("version"), createdAt: new Date().toISOString(), summary: idea.summary, canvas: idea.canvas };
        return { ...idea, summary: version.summary, canvas: version.canvas, versions: [currentVersion, ...idea.versions.filter((item) => item.id !== versionId)] };
      }) }));
    },
    deleteIdea(ideaId) {
      setData((current) => {
        const idea = current.ideas.find((item) => item.id === ideaId);
        if (!idea) return current;
        return { ...current, ideas: current.ideas.filter((item) => item.id !== ideaId), trash: [{ id: createId("trash"), kind: "idea", label: idea.title, payload: idea, deletedAt: new Date().toISOString() }, ...current.trash] };
      });
    },
    addKnowledge(input) {
      const id = createId(input.kind);
      setData((current) => ({ ...current, knowledge: [{ ...input, id, createdAt: new Date().toISOString() }, ...current.knowledge] }));
      return id;
    },
    updateKnowledge(itemId, updates) {
      setData((current) => ({ ...current, knowledge: current.knowledge.map((item) => item.id === itemId ? { ...item, ...updates } : item) }));
    },
    deleteKnowledge(itemId) {
      setData((current) => {
        const item = current.knowledge.find((entry) => entry.id === itemId);
        if (!item) return current;
        return { ...current, knowledge: current.knowledge.filter((entry) => entry.id !== itemId), trash: [{ id: createId("trash"), kind: "knowledge", label: item.title, payload: item, deletedAt: new Date().toISOString() }, ...current.trash] };
      });
    },
    addTask(input) {
      const id = createId("task");
      setData((current) => ({ ...current, tasks: [{ id, ...input, model: input.model ?? current.settings.model, status: "queued", progress: 0, createdAt: new Date().toISOString() }, ...current.tasks] }));
      return id;
    },
    updateTask(taskId, updates) {
      setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? { ...task, ...updates } : task) }));
    },
    clearFinishedTasks() {
      setData((current) => ({ ...current, tasks: current.tasks.filter((task) => task.status === "queued" || task.status === "running") }));
    },
    restoreTrashItem(trashId) {
      setData((current) => {
        const entry = current.trash.find((item) => item.id === trashId);
        if (!entry) return current;
        return { ...current, knowledge: entry.kind === "knowledge" ? [entry.payload as KnowledgeItem, ...current.knowledge] : current.knowledge, ideas: entry.kind === "idea" ? [entry.payload as LocalIdea, ...current.ideas] : current.ideas, trash: current.trash.filter((item) => item.id !== trashId) };
      });
    },
    permanentlyDeleteTrashItem(trashId) {
      setData((current) => ({ ...current, trash: current.trash.filter((item) => item.id !== trashId) }));
    },
    importWorkspace(input) {
      try {
        const parsed = JSON.parse(input) as Partial<WorkspaceData>;
        if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.papers)) return { ok: false, error: "备份缺少项目或文献数据。" };
        setData({ ...initialData, ...parsed, ideas: (parsed.ideas ?? []).map((idea) => ({ ...idea, canvas: { ...EMPTY_CANVAS, ...idea.canvas }, evidenceIds: idea.evidenceIds ?? [], versions: idea.versions ?? [], evidenceCount: idea.evidenceIds?.length ?? idea.evidenceCount ?? 0 })), settings: { ...initialData.settings, ...parsed.settings }, knowledge: parsed.knowledge ?? [], tasks: parsed.tasks ?? [], trash: parsed.trash ?? [], readerAnswers: parsed.readerAnswers ?? [], readerExcerpts: parsed.readerExcerpts ?? [], readerPositions: parsed.readerPositions ?? [] });
        return { ok: true };
      } catch {
        return { ok: false, error: "无法解析备份文件。" };
      }
    },
    exportWorkspace() {
      return JSON.stringify({ format: "paperidea-workspace", version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
    },
    updateSettings(settings) {
      setData((current) => ({ ...current, settings: { ...current.settings, ...settings } }));
    },
    addReaderAnswer(answer) {
      setData((current) => ({
        ...current,
        readerAnswers: [{ ...answer, id: createId("answer") }, ...current.readerAnswers],
      }));
    },
    addReaderExcerpt(excerpt) {
      setData((current) => ({
        ...current,
        readerExcerpts: [{ ...excerpt, id: createId("excerpt"), createdAt: new Date().toISOString() }, ...current.readerExcerpts],
      }));
    },
    updateReaderExcerpt(excerptId, updates) {
      setData((current) => ({ ...current, readerExcerpts: current.readerExcerpts.map((excerpt) => excerpt.id === excerptId ? { ...excerpt, ...updates } : excerpt) }));
    },
    deleteReaderExcerpt(excerptId) {
      setData((current) => ({ ...current, readerExcerpts: current.readerExcerpts.filter((excerpt) => excerpt.id !== excerptId) }));
    },
    setReaderPosition(position) {
      setData((current) => ({
        ...current,
        readerPositions: [
          { ...position, updatedAt: new Date().toISOString() },
          ...current.readerPositions.filter((item) => item.projectId !== position.projectId || item.paperId !== position.paperId),
        ],
      }));
    },
    resetLocalData() {
      window.localStorage.removeItem(storageKey);
      setData(initialData);
    },
    async retrySync(entryId) {
      const entry = data.pendingSync.find((item) => item.id === entryId);
      if (!entry) return;
      // 从 localStorage 恢复的条目没有可执行的 retry 闭包(JSON 序列化会丢弃函数),
      // 无法重试,直接清除,避免条目永久卡在队列里。见 ERR-20260814-001。
      if (typeof entry.retry !== "function") {
        setData((current) => ({ ...current, pendingSync: current.pendingSync.filter((item) => item.id !== entryId) }));
        return;
      }
      try {
        await entry.retry();
        setData((current) => ({ ...current, pendingSync: current.pendingSync.filter((item) => item.id !== entryId) }));
      } catch (error) {
        if (isAlreadyResolved(error)) {
          setData((current) => ({ ...current, pendingSync: current.pendingSync.filter((item) => item.id !== entryId) }));
          return;
        }
        setData((current) => ({
          ...current,
          pendingSync: current.pendingSync.map((item) => item.id === entryId
            ? { ...item, error: error instanceof Error ? error.message : "重试失败" }
            : item),
        }));
      }
    },
    dismissSync(entryId) {
      setData((current) => ({ ...current, pendingSync: current.pendingSync.filter((item) => item.id !== entryId) }));
    },
    dismissAllSync() {
      setData((current) => ({ ...current, pendingSync: [] }));
    },
  }), [data]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return value;
}

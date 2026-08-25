export type EvidenceStatus = "draft" | "confirmed" | "conflict" | "missing";

export interface MatrixPaper {
  id: string;
  name: string;
  title: string;
  venue: string;
  year: number;
  hasFile: boolean;
}

export interface MatrixRow {
  id: string;
  label: string;
}

export interface MatrixGroup {
  id: string;
  label: string;
  rows: MatrixRow[];
}

export interface EvidenceCell {
  id: string;
  value: string;
  status: EvidenceStatus;
  confidence: number;
  claim: string;
  sourcePage: string;
  sourceSection: string;
  sourceExcerpt: string;
  locked: boolean;
}

export interface MatrixResponse {
  project: {
    id: string;
    name: string;
    description: string | null;
    extractionProgress: number;
  };
  papers: MatrixPaper[];
  groups: MatrixGroup[];
  cells: Record<string, EvidenceCell>;
}

export interface AiProviderInfo {
  id: string;
  label: string;
  models: string[];
}

/**
 * 请求头助手(单用户本地版:无鉴权,不附加 Bearer token)。
 * 保留此函数名以减少对调用点的改动;仅组装传入的额外头(content-type 等)。
 */
export function authenticatedHeaders(extra?: HeadersInit) {
  return new Headers(extra);
}

/** 从后端取当前 AI 模型名 + 可用厂商列表(健康检查无需鉴权)。失败时回退空。 */
export async function getAiModels(): Promise<{ model: string; models: string[]; providers: AiProviderInfo[] }> {
  try {
    const response = await fetch("/api/health");
    if (!response.ok) return { model: "", models: [], providers: [] };
    const payload = (await response.json()) as { model?: string; models?: string[]; providers?: AiProviderInfo[] };
    return { model: payload.model ?? "", models: payload.models ?? [], providers: payload.providers ?? [] };
  } catch {
    return { model: "", models: [], providers: [] };
  }
}

/** 账户级 AI 配置(设置页表单保存,优先于环境变量配置)。apiKey 永不回传,只给掩码。 */
export interface AiConfig {
  configured: boolean;
  baseUrl: string;
  model: string;
  apiKeyMasked: string | null;
  envProviders: AiProviderInfo[];
}

export async function getAiConfig(): Promise<AiConfig> {
  return parseResponse(await fetch("/api/ai/config", { headers: authenticatedHeaders() }));
}

/** apiKey 留空 = 保留已保存的密钥(表单只回显掩码,不必每次重输)。 */
export async function saveAiConfig(input: { baseUrl: string; apiKey: string; model: string }): Promise<AiConfig> {
  return parseResponse(await fetch("/api/ai/config", {
    method: "PUT",
    headers: authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(input),
  }));
}

export async function deleteAiConfig(): Promise<{ cleared: true }> {
  return parseResponse(await fetch("/api/ai/config", { method: "DELETE", headers: authenticatedHeaders() }));
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) throw new Error("Unauthorized");
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `请求失败 (${response.status})`);
  }
  return payload;
}

export async function getMatrix(projectId: string): Promise<MatrixResponse> {
  return parseResponse<MatrixResponse>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/matrix`, {
    headers: authenticatedHeaders(),
  }));
}

export async function getMatrixById(matrixId: string): Promise<MatrixResponse> {
  return parseResponse<MatrixResponse>(await fetch(`/api/matrices/${encodeURIComponent(matrixId)}`, { headers: authenticatedHeaders() }));
}

export async function saveMatrix(input: { id: string; projectId: string; name: string; description: string; paperIds: string[]; dimensions: Array<{ id: string; label: string }> }) {
  return parseResponse<{ id: string; projectId: string }>(await fetch(`/api/matrices/${encodeURIComponent(input.id)}`, {
    method: "PUT", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

export interface GeneratedPaperCard {
  card: { problem: string; method: string; data: string; findings: string; limitations: string };
  sources: { problem: string; method: string; data: string; findings: string; limitations: string };
  model: string;
  generatedAt: string;
  source: string;
}

export async function generatePaperCard(paperId: string, input: { text: string; title: string; authors?: string; source?: string; model?: string; provider?: string }) {
  return parseResponse<GeneratedPaperCard>(await fetch(`/api/papers/${encodeURIComponent(paperId)}/card`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

export async function syncPaper(projectId: string, paper: { id: string; title: string; authors: string; venue: string; year: number; abstract?: string; doi?: string; arxivId?: string; sourceUrl?: string; fileHash?: string }) {
  return parseResponse<{ paperId: string; duplicate: boolean }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paper.id)}`, {
    method: "PUT", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(paper),
  }));
}

export async function syncProject(project: { id: string; name: string; description: string; workspacePath?: string | null }) {
  return parseResponse<{ id: string }>(await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(project),
  }));
}

export async function uploadPaperFile(paperId: string, file: Blob, onProgress?: (progress: number) => void) {
  return new Promise<{ paperId: string; size: number; cloudStored: boolean }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `/api/papers/${encodeURIComponent(paperId)}/file`);
    request.setRequestHeader("content-type", "application/pdf");
    request.upload.onprogress = (event) => onProgress?.(event.lengthComputable ? event.loaded / event.total : 0);
    request.onerror = () => reject(new Error("PDF 云端上传失败"));
    request.onload = () => {
      let payload: { paperId?: string; size?: number; error?: string; message?: string } = {};
      try { payload = JSON.parse(request.responseText) as typeof payload; } catch { /* handled below */ }
      if (request.status < 200 || request.status >= 300) return reject(new Error(payload.message ?? `PDF 上传失败 (${request.status})`));
      resolve({ paperId: payload.paperId!, size: payload.size!, cloudStored: true });
    };
    request.send(file);
  });
}

/** 从云端(Turso 内嵌 BLOB)下载论文 PDF,供本地 IndexedDB 未命中时回退。
 *  404(论文没有 PDF)时返回 null,调用方静默降级;其它错误抛出。 */
export async function downloadPaperFile(paperId: string): Promise<Blob | null> {
  const response = await fetch(`/api/papers/${encodeURIComponent(paperId)}/file`, {
    headers: authenticatedHeaders({}),
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    let message = `PDF 下载失败 (${response.status})`;
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload.message) message = payload.message;
    } catch { /* 非 JSON 响应,保留默认消息 */ }
    throw new Error(message);
  }
  return response.blob();
}

export async function resolveLiterature(value: string) {
  return parseResponse<{ title: string; authors: string; venue: string; year: number; abstract?: string; doi?: string; arxivId?: string; sourceUrl?: string }>(await fetch("/api/literature/resolve", {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ value }),
  }));
}

export async function extractMatrix(matrixId: string, input: { papers: Array<{ id: string; title: string; pages: Array<{ page: number; text: string }> }>; dimensions: Array<{ id: string; label: string }>; model?: string; provider?: string }) {
  return parseResponse<{ status: "completed" | "nothing_to_extract"; updated: number; total?: number; progress?: number; model?: string; message?: string }>(await fetch(`/api/matrices/${encodeURIComponent(matrixId)}/extract`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

export async function translateSelection(input: { text: string; targetLanguage: "中文" | "English"; paperTitle: string; page: number; model?: string; provider?: string }) {
  return parseResponse<{ translation: string; model: string }>(await fetch("/api/reader/translate", {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

export async function updateEvidence(
  evidenceId: string,
  status: EvidenceStatus,
  locked: boolean,
): Promise<{ id: string; status: EvidenceStatus; locked: boolean }> {
  return parseResponse(
    await fetch(`/api/evidence/${encodeURIComponent(evidenceId)}`, {
      method: "PATCH",
      headers: authenticatedHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ status, locked }),
    }),
  );
}

export async function createExtractionPlan(projectId: string): Promise<{
  status: "completed" | "nothing_to_plan";
  jobId?: string;
  model?: string;
  candidateCount?: number;
  plan?: string;
  message?: string;
}> {
  return parseResponse(
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/extraction-plan`, {
      method: "POST",
      headers: authenticatedHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ maxCandidates: 15 }),
    }),
  );
}

export async function askReader(input: {
  paper: { id: string; title: string; authors: string; year: number };
  page: number;
  selection: string;
  fullText?: string;
  question: string;
  model?: string;
  provider?: string;
}): Promise<{ answer: string; model: string; generatedAt: string }> {
  return parseResponse(
    await fetch("/api/reader/ask", {
      method: "POST",
      headers: authenticatedHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(input),
    }),
  );
}

// ----------------------------------------------------------------------------
// 项目与文献管理 CRUD (2026-08-13 新增)
// ----------------------------------------------------------------------------

export interface RemoteProject {
  id: string;
  name: string;
  description: string;
  extractionProgress: number;
  createdAt: string;
  archived: boolean;
  archivedAt: string | null;
  sortOrder: number;
  paperCount: number;
  workspacePath: string | null;
}

export interface RemotePaper {
  id: string;
  title: string;
  shortName: string;
  authors: string;
  venue: string;
  year: number;
  abstract: string | null;
  doi: string | null;
  arxivId: string | null;
  sourceUrl: string | null;
  fileHash: string | null;
  hasFile: boolean;
  mimeType: string | null;
  fileSize: number | null;
  createdAt: string;
  readingStatus: string;
  favorite: boolean;
  tags: string[];
  fileName: string | null;
  pageCount: number | null;
  outline: Array<{ title: string; page: number }>;
  archived: boolean;
  archivedAt: string | null;
}

export async function listProjects(includeArchived = false): Promise<{ projects: RemoteProject[] }> {
  const search = includeArchived ? "?includeArchived=true" : "";
  return parseResponse(await fetch(`/api/projects${search}`, { headers: authenticatedHeaders() }));
}

export async function getProject(projectId: string): Promise<{ project: RemoteProject }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { headers: authenticatedHeaders() }));
}

export async function patchProject(projectId: string, patch: { name?: string; description?: string; workspacePath?: string | null }): Promise<{ project: RemoteProject }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 打开系统原生文件夹选择器(后端 spawn 子进程)。取消时返回 null。 */
export async function pickDirectory(): Promise<string | null> {
  const response = await fetch("/api/system/pick-directory", {
    method: "POST",
    headers: authenticatedHeaders({ "content-type": "application/json" }),
    body: "{}",
  });
  if (response.status === 401) throw new Error("Unauthorized");
  const payload = (await response.json()) as { path?: string; cancelled?: boolean; message?: string };
  if (response.status === 409 || response.status >= 500) {
    throw new Error(payload.message ?? `选择文件夹失败 (${response.status})`);
  }
  if (!response.ok) throw new Error(payload.message ?? `选择文件夹失败 (${response.status})`);
  if (payload.cancelled || !payload.path) return null;
  return payload.path;
}

/** 在系统文件管理器中打开已关联的本地路径。 */
export async function openLocalPath(path: string): Promise<void> {
  await parseResponse<{ opened: true }>(await fetch("/api/system/open-path", {
    method: "POST",
    headers: authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ path }),
  }));
}

/**
 * 删除项目。后端会级联清理 project_papers / matrices / evidence_cells / extraction_jobs。
 * 当项目仍有关联文献时返回 409 PROJECT_NOT_EMPTY,调用方需要传 force=true 才会真正删除。
 * `parseResponse` 在非 2xx 响应上会抛 Error,直接进入 catch 让 UI 提示。
 */
export async function deleteProject(projectId: string, options: { force?: boolean } = {}): Promise<{ id: string; deleted: true }> {
  const search = options.force ? "?force=true" : "";
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}${search}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

export async function listPapersByProject(projectId: string): Promise<{ papers: RemotePaper[] }> {
  return parseResponse(await fetch(`/api/papers?projectId=${encodeURIComponent(projectId)}`, { headers: authenticatedHeaders() }));
}

export async function listPapersByIds(ids: string[]): Promise<{ papers: RemotePaper[] }> {
  if (ids.length === 0) return { papers: [] };
  return parseResponse(await fetch(`/api/papers?ids=${encodeURIComponent(ids.join(","))}`, { headers: authenticatedHeaders() }));
}

export async function getPaper(paperId: string): Promise<{ paper: RemotePaper }> {
  return parseResponse(await fetch(`/api/papers/${encodeURIComponent(paperId)}`, { headers: authenticatedHeaders() }));
}

export async function patchPaper(
  paperId: string,
  patch: {
    title?: string;
    authors?: string;
    venue?: string;
    year?: number;
    abstract?: string;
    doi?: string;
    arxivId?: string;
    sourceUrl?: string;
    readingStatus?: string;
    favorite?: boolean;
    tags?: string[];
    fileName?: string;
    pageCount?: number;
    outline?: Array<{ title: string; page: number }>;
  },
): Promise<{ paper: RemotePaper }> {
  return parseResponse(await fetch(`/api/papers/${encodeURIComponent(paperId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 物理删除论文(替代旧"归档"):级联清理关联矩阵证据与 R2 文件,不可恢复。 */
export async function deletePaper(paperId: string): Promise<{ paperId: string; deleted: true }> {
  return parseResponse(await fetch(`/api/papers/${encodeURIComponent(paperId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

export async function removePaperFromProject(paperId: string, projectId: string): Promise<{ paperId: string; projectId: string; removed: boolean }> {
  return parseResponse(await fetch(`/api/papers/${encodeURIComponent(paperId)}/project/${encodeURIComponent(projectId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

// ═══ Research Arc (研究弧,v2.0):Knowledge → Gap → Idea → Review → Experiment,以 RQ 为脊柱 ═══

/** 知识对象(迁移 0007):后端持久化的 Note/Claim/Evidence,带 provenance。与 evidence_cells 矩阵格是不同粒度。 */
export interface KnowledgeItem {
  id: string;
  projectId: string;
  paperId: string;
  kind: "note" | "claim" | "evidence";
  title: string;
  content: string;
  quote?: string;
  note: string;
  page: number;
  location?: string | null;
  source: "human" | "ai";
  status: "draft" | "confirmed";
  model?: string | null;
  generatedAt?: string | null;
  createdAt: string;
}

/** Research Question 研究问题(迁移 0013,v2.0 Research Core):一等对象,脊柱层。provenance 同 Knowledge。 */
export type RqStatus = "open" | "investigating" | "evidenced" | "concluded" | "abandoned";
export type RqSource = "human" | "ai";
export interface RqLinkedPaper {
  paperId: string;
  role: string;
  title: string;
  shortName: string;
  authors: string;
  year: number;
}
export interface ResearchQuestion {
  id: string;
  projectId: string;
  question: string;
  goal: string;
  status: RqStatus;
  source: RqSource;
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  papers: RqLinkedPaper[];
}

/** Gap 缺口(迁移 0009):研究缺口一等对象,带状态机。provenance 同 Knowledge。 */
export type GapStatus = "candidate" | "searching" | "evidenced" | "converted" | "rejected";
export type GapSource = "human" | "ai";
export interface Gap {
  id: string;
  projectId: string;
  paperId: string | null;
  rqId: string | null;
  title: string;
  description: string;
  rationale: string;
  note: string;
  status: GapStatus;
  source: GapSource;
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
/** 缺口挂载的知识证据(gap_evidence 表)。 */
export interface GapEvidenceLink {
  id: string;
  knowledgeItemId: string;
  stance: "supports" | "contradicts" | "context";
}

/** Idea 一等对象(迁移 0010):研究想法,围绕 Version 设计(C7)。与 workspace 的 LocalIdea 对应。 */
export type IdeaStatus = "Inbox" | "Draft" | "Reviewing" | "Revise" | "Approved" | "Experimenting" | "Writing" | "Archived";

/** 6 段式研究画布(与后端 IdeaCanvas 一致)。 */
export interface IdeaCanvas {
  problem: string;
  gap: string;
  hypothesis: string;
  method: string;
  experiment: string;
  risks: string;
}

/** Idea 的一个不可变版本快照(C7)。 */
export interface IdeaVersion {
  id: string;
  ideaId: string;
  versionNo: number;
  title: string;
  summary: string;
  canvas: IdeaCanvas;
  rationale: string;
  createdBy: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
}

/** Idea 关联的知识证据(idea_evidence 表)。 */
export interface IdeaEvidenceLink {
  id: string;
  knowledgeItemId: string;
  role: "supports" | "contradicts" | "context";
}

/** Idea 一等对象(含当前版本 + 证据;单条 GET 还附全部历史版本)。 */
export interface Idea {
  id: string;
  projectId: string;
  sourceGapId: string | null;
  rqId: string | null;
  title: string;
  summary: string;
  status: IdeaStatus;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: IdeaVersion | null;
  evidence: IdeaEvidenceLink[];
  versions?: IdeaVersion[];
}
export async function createKnowledge(
  projectId: string,
  input: { paperId: string; kind: "note" | "claim" | "evidence"; title: string; content: string; quote?: string; note?: string; page?: number; status?: "draft" | "confirmed" },
): Promise<{ item: KnowledgeItem }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** Reader 划选 AI 提炼:后端按 quote+page+paperId 生成并直接存 draft,返回带 provenance 的 KnowledgeItem。 */
export async function extractKnowledge(
  projectId: string,
  input: { paperId: string; quote: string; page: number },
): Promise<{ item: KnowledgeItem }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/extract`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 列出某项目的全部知识对象(本项目 + 本账号隔离)。 */
export async function listKnowledge(projectId: string): Promise<{ items: KnowledgeItem[] }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge`, {
    headers: authenticatedHeaders(),
  }));
}

/** 人工修改知识对象(含 draft→confirmed 确认)。 */
export async function patchKnowledge(
  projectId: string,
  knowledgeId: string,
  patch: Partial<Pick<KnowledgeItem, "title" | "content" | "note" | "kind" | "status">>,
): Promise<{ item: KnowledgeItem }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/${encodeURIComponent(knowledgeId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 删除知识对象。 */
export async function deleteKnowledge(projectId: string, knowledgeId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/${encodeURIComponent(knowledgeId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 知识关系(迁移 0008):supports / contradicts / duplicates。前端传顺序无关,后端规范化去重。 */
export type KnowledgeRelationType = "supports" | "contradicts" | "duplicates";

export interface KnowledgeRelation {
  id: string;
  itemIdA: string;
  itemIdB: string;
  type: KnowledgeRelationType;
  note: string;
  createdAt: string;
  /** 后端 enrichment 的两端标题。 */
  titleA?: string;
  titleB?: string;
}

/** 创建关系(幂等:已存在则返回 200 原记录)。 */
export async function createKnowledgeRelation(
  projectId: string,
  input: { itemIdA: string; itemIdB: string; type: KnowledgeRelationType; note?: string },
): Promise<{ relation: KnowledgeRelation }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/relations`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 列出本项目全部知识关系(含两端标题)。 */
export async function listKnowledgeRelations(projectId: string): Promise<{ relations: KnowledgeRelation[] }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/relations`, {
    headers: authenticatedHeaders(),
  }));
}

/** 删除一条知识关系。 */
export async function deleteKnowledgeRelation(projectId: string, relationId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

// ─── Gap 缺口(迁移 0009):Gap 一等对象 + gap_evidence + Gap Discovery ───

/** 人工创建一条缺口(后端权威源,candidate,source:human)。 */
export async function createGap(
  projectId: string,
  input: { paperId?: string; title: string; description?: string; rationale?: string; note?: string },
): Promise<{ gap: Gap }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 列出某项目的全部缺口(每条附挂载的证据 id 列表)。 */
export async function listGaps(projectId: string): Promise<{ gaps: Array<Gap & { evidence: GapEvidenceLink[] }> }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps`, {
    headers: authenticatedHeaders(),
  }));
}

/** 修改缺口(含状态流转:传入 status 走后端状态机校验)。 */
export async function patchGap(
  projectId: string,
  gapId: string,
  patch: Partial<Pick<Gap, "title" | "description" | "rationale" | "note" | "status">> & { convertedIdeaId?: string },
): Promise<{ gap: Gap }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps/${encodeURIComponent(gapId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 删除缺口(级联清 gap_evidence)。 */
export async function deleteGap(projectId: string, gapId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps/${encodeURIComponent(gapId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 给缺口挂一条知识证据(幂等:已挂则更新 stance)。 */
export async function addGapEvidence(
  projectId: string,
  gapId: string,
  input: { knowledgeItemId: string; stance: "supports" | "contradicts" | "context"; note?: string },
): Promise<{ evidence: { id: string } }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps/${encodeURIComponent(gapId)}/evidence`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 摘掉一条缺口证据。 */
export async function deleteGapEvidence(projectId: string, gapId: string, evidenceId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps/${encodeURIComponent(gapId)}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** AI 从本项目知识发现缺口(后端直接存 candidate,source:ai)。 */
export async function discoverGaps(projectId: string): Promise<{ gaps: Gap[]; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/gaps/discover`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
  }));
}

// ─── Research Question 研究问题(迁移 0013,v2.0):脊柱层,Paper/Gap/Idea 挂到它上面 ───

/** 创建一个研究问题(可选同时关联 paperIds;均须属本项目)。 */
export async function createResearchQuestion(
  projectId: string,
  input: { question: string; goal?: string; paperIds?: string[] },
): Promise<{ researchQuestion: ResearchQuestion }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 列出某项目全部研究问题(每条附关联论文)。 */
export async function listResearchQuestions(projectId: string): Promise<{ researchQuestions: ResearchQuestion[] }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions`, {
    headers: authenticatedHeaders(),
  }));
}

/** 单条研究问题(含关联论文)。 */
export async function getResearchQuestion(projectId: string, rqId: string): Promise<{ researchQuestion: ResearchQuestion }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions/${encodeURIComponent(rqId)}`, {
    headers: authenticatedHeaders(),
  }));
}

/** 修改研究问题(传 status 走后端状态机校验)。 */
export async function patchResearchQuestion(
  projectId: string,
  rqId: string,
  patch: Partial<Pick<ResearchQuestion, "question" | "goal" | "status">>,
): Promise<{ researchQuestion: ResearchQuestion }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions/${encodeURIComponent(rqId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 删除研究问题(级联清 rq_papers;gaps/ideas 的 rqId 置空)。 */
export async function deleteResearchQuestion(projectId: string, rqId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions/${encodeURIComponent(rqId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 给研究问题关联一篇论文(幂等;论文须属本项目)。 */
export async function linkRqPaper(
  projectId: string,
  rqId: string,
  input: { paperId: string; role?: string },
): Promise<{ link: { rqId: string; paperId: string; role: string } }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions/${encodeURIComponent(rqId)}/papers`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 摘掉研究问题的一篇论文关联。 */
export async function unlinkRqPaper(projectId: string, rqId: string, paperId: string): Promise<{ rqId: string; paperId: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/research-questions/${encodeURIComponent(rqId)}/papers/${encodeURIComponent(paperId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

// ─── Experiment 实验(迁移 0014,v2.0):Idea → Experiment → Result,result append-only(C7) ───

export type ExperimentStatus = "planned" | "running" | "done" | "failed";
export type ExperimentSource = "human" | "ai";
export interface ExperimentResult {
  id: string;
  experimentId: string;
  runNo: number;
  metrics: Record<string, unknown>;
  figures: unknown[];
  notes: string;
  createdAt: string;
}

// ─── Evidence Layer 证据三层(迁移 0015,v2.0):raw(quote) → interpretation(理解) → implication(启发/假设) ───

export type EvidenceLayerLevel = "raw" | "interpretation" | "implication";
export type EvidenceLayerSource = "human" | "ai";
export interface EvidenceLayer {
  id: string;
  projectId: string;
  paperId: string;
  knowledgeItemId: string | null;
  parentId: string | null;
  level: EvidenceLayerLevel;
  content: string;
  quote: string;
  page: number;
  location: string | null;
  status: "draft" | "confirmed";
  promotedTo: string | null;
  source: EvidenceLayerSource;
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Experiment {
  id: string;
  projectId: string;
  ideaId: string | null;
  rqId: string | null;
  title: string;
  hypothesis: string;
  config: Record<string, unknown>;
  repoUrl: string;
  commitHash: string;
  checkpointPath: string;
  status: ExperimentStatus;
  conclusion: string;
  source: ExperimentSource;
  model: string | null;
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  results: ExperimentResult[];
}

/** 创建一个实验(可选挂 ideaId/rqId;均须属本项目)。 */
export async function createExperiment(
  projectId: string,
  input: { title: string; ideaId?: string; rqId?: string; hypothesis?: string; config?: Record<string, unknown>; repoUrl?: string; commitHash?: string; checkpointPath?: string },
): Promise<{ experiment: Experiment }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 列出某项目全部实验(每条附 append-only 结果)。 */
export async function listExperiments(projectId: string): Promise<{ experiments: Experiment[] }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments`, {
    headers: authenticatedHeaders(),
  }));
}

/** 单条实验(含 append-only 结果)。 */
export async function getExperiment(projectId: string, experimentId: string): Promise<{ experiment: Experiment }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}`, {
    headers: authenticatedHeaders(),
  }));
}

/** 修改实验(传 status 走后端状态机;config 作为对象传入,后端转 JSON)。 */
export async function patchExperiment(
  projectId: string,
  experimentId: string,
  patch: Partial<Pick<Experiment, "title" | "hypothesis" | "status" | "conclusion" | "repoUrl" | "commitHash" | "checkpointPath">> & { config?: Record<string, unknown> },
): Promise<{ experiment: Experiment }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 删除实验(级联清 append-only 结果)。 */
export async function deleteExperiment(projectId: string, experimentId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 追加一次跑动结果(append-only,不覆盖旧结果)。 */
export async function addExperimentResult(
  projectId: string,
  experimentId: string,
  input: { metrics?: Record<string, unknown>; figures?: unknown[]; notes?: string },
): Promise<{ result: ExperimentResult }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/results`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 删除一条结果(append-only 模型的谨慎操作)。 */
export async function deleteExperimentResult(projectId: string, experimentId: string, resultId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/experiments/${encodeURIComponent(experimentId)}/results/${encodeURIComponent(resultId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 列出证据层(可按 paperId / knowledgeItemId 过滤)。 */
export async function listEvidenceLayers(
  projectId: string,
  query?: { paperId?: string; knowledgeItemId?: string },
): Promise<{ layers: EvidenceLayer[] }> {
  const params = new URLSearchParams();
  if (query?.paperId) params.set("paperId", query.paperId);
  if (query?.knowledgeItemId) params.set("knowledgeItemId", query.knowledgeItemId);
  const qs = params.toString();
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers${qs ? `?${qs}` : ""}`, {
    headers: authenticatedHeaders(),
  }));
}

/** 人工创建一层(raw/interpretation/implication)。人工创建一律 confirmed;paperId 须属本项目。 */
export async function createEvidenceLayer(
  projectId: string,
  input: { paperId: string; knowledgeItemId?: string; parentId?: string; level?: EvidenceLayerLevel; content: string; quote?: string; page?: number; location?: string },
): Promise<{ layer: EvidenceLayer }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 修改一层(可改 content/quote/location/status;draft→confirmed 在这里发生)。 */
export async function patchEvidenceLayer(
  projectId: string,
  layerId: string,
  patch: Partial<Pick<EvidenceLayer, "content" | "quote" | "location" | "status">>,
): Promise<{ layer: EvidenceLayer }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers/${encodeURIComponent(layerId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 删除一层(子层不级联)。 */
export async function deleteEvidenceLayer(projectId: string, layerId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers/${encodeURIComponent(layerId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 确认一层(draft → confirmed)。用户确认入口,AI 层只能经此升级。 */
export async function confirmEvidenceLayer(projectId: string, layerId: string): Promise<{ layer: EvidenceLayer }> {
  return patchEvidenceLayer(projectId, layerId, { status: "confirmed" });
}

/** AI 基于一层生成 interpretation(后端直存 draft,source:ai)。 */
export async function interpretEvidenceLayer(projectId: string, layerId: string): Promise<{ layer: EvidenceLayer; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers/${encodeURIComponent(layerId)}/interpret`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
  }));
}

/** AI 基于一层生成 implication(后端直存 draft,source:ai)。 */
export async function implyEvidenceLayer(projectId: string, layerId: string): Promise<{ layer: EvidenceLayer; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers/${encodeURIComponent(layerId)}/imply`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
  }));
}

/** 晋升一层(confirmed → knowledge | gap | idea)。用户显式触发,永不自动。后端拒绝未确认或已晋升的层。 */
export async function promoteEvidenceLayer(projectId: string, layerId: string, target: "knowledge" | "gap" | "idea", title?: string): Promise<{ target: string; id: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/evidence-layers/${encodeURIComponent(layerId)}/promote`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ target, title }),
  }));
}

/** 新建一条 Idea(可选从缺口转换:传 sourceGapId)。落初始版本 1。 */
export async function createIdea(
  projectId: string,
  input: { title: string; summary?: string; sourceGapId?: string; canvas?: Partial<IdeaCanvas> },
): Promise<{ idea: Idea }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 列出某项目的全部 Idea(每条附当前版本 + 证据)。 */
export async function listIdeas(projectId: string): Promise<{ ideas: Idea[] }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas`, {
    headers: authenticatedHeaders(),
  }));
}

/** 单条 Idea(含当前版本 + 全部历史版本 + 证据)。 */
export async function getIdea(projectId: string, ideaId: string): Promise<{ idea: Idea }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}`, {
    headers: authenticatedHeaders(),
  }));
}

/** 修改 Idea:传 canvas 落一条新版本(C7),否则只改 title/summary/status。 */
export async function patchIdea(
  projectId: string,
  ideaId: string,
  patch: { title?: string; summary?: string; status?: IdeaStatus; canvas?: Partial<IdeaCanvas>; rationale?: string },
): Promise<{ idea: Idea }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
  }));
}

/** 删除 Idea(级联清版本 + 证据)。 */
export async function deleteIdea(projectId: string, ideaId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 给 Idea 挂一条知识证据(幂等:已挂则更新 role)。 */
export async function addIdeaEvidence(
  projectId: string,
  ideaId: string,
  input: { knowledgeItemId: string; role?: "supports" | "contradicts" | "context"; note?: string },
): Promise<{ evidence: { id: string } }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/evidence`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** 摘掉一条 Idea 证据。 */
export async function deleteIdeaEvidence(projectId: string, ideaId: string, evidenceId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 恢复 Idea 到某历史版本:后端复制该版本画布成一条新版本并设为当前(不覆盖旧版,C7)。 */
export async function restoreIdeaVersion(projectId: string, ideaId: string, versionId: string): Promise<{ idea: Idea }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/restore`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify({ versionId }),
  }));
}

/** AI 重新起草 6 段画布:基于当前画布 + 可选修改指令,后端落一条 ai 新版本(C7)。 */
export async function regenerateIdeaCanvas(
  projectId: string,
  ideaId: string,
  input: { instruction?: string } = {},
): Promise<{ idea: Idea; versionId: string; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/regenerate`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** AI 起草 6 段画布(后端直接落一条 ai 新版本,C7)。 */
export async function draftIdeaCanvas(projectId: string, ideaId: string): Promise<{ idea: Idea; versionId: string; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/draft`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
  }));
}

/** 评审建议(idea_reviews.suggestions_json 的单条)。 */
export interface ReviewSuggestion {
  id: string;
  target: string;
  issue: string;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

/** Idea 评审(迁移 0012)。 */
export interface IdeaReview {
  id: string;
  ideaId: string;
  reviewer: string;
  verdict: "strong" | "viable" | "weak" | "reject";
  strengths: string;
  weaknesses: string;
  risks: string;
  suggestions: ReviewSuggestion[];
  source: "human" | "ai";
  model: string | null;
  generatedAt: string | null;
  reviewedVersionId: string | null;
  revisedVersionId: string | null;
  status: "open" | "applied" | "dismissed";
  createdAt: string;
}

/** AI 评审当前版本(后端直接落库,source:ai)。 */
export async function reviewIdea(projectId: string, ideaId: string): Promise<{ review: IdeaReview; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/reviews/ai`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
  }));
}

/** 列出某 Idea 的全部评审(最新在前)。 */
export async function listIdeaReviews(projectId: string, ideaId: string): Promise<{ reviews: IdeaReview[] }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/reviews`, {
    headers: authenticatedHeaders(),
  }));
}

/** 删除一条评审。 */
export async function deleteIdeaReview(projectId: string, ideaId: string, reviewId: string): Promise<{ id: string; deleted: true }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/reviews/${encodeURIComponent(reviewId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

/** 采纳建议 → AI 修订出新版本(C7),评审标 applied。 */
export async function applyIdeaReview(
  projectId: string,
  ideaId: string,
  reviewId: string,
  input: { suggestionIds: string[] },
): Promise<{ idea: { id: string; status: string; currentVersionId: string }; review: IdeaReview; versionId: string; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/ideas/${encodeURIComponent(ideaId)}/reviews/${encodeURIComponent(reviewId)}/apply`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(input),
  }));
}

/** P6 Knowledge Intelligence:情报分析结果(冲突/重复/综合/缺失证据)。 */
export interface KnowledgeConflict { aId: string; bId: string; reason: string; }
export interface KnowledgeDuplicate { aId: string; bId: string; reason: string; }
export interface KnowledgeMissing { topic: string; why: string; }
export interface KnowledgeIntelligence {
  synthesis: string;
  conflicts: KnowledgeConflict[];
  duplicates: KnowledgeDuplicate[];
  missingEvidence: KnowledgeMissing[];
}

/** P6:AI 情报分析本项目知识(冲突/重复/综合/缺失证据)。无新表,纯分析。 */
export async function analyzeKnowledge(projectId: string): Promise<{ analysis: KnowledgeIntelligence; model: string }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}/knowledge/analyze`, {
    method: "POST", headers: authenticatedHeaders({ "content-type": "application/json" }),
  }));
}


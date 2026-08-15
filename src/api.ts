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

const ACCESS_TOKEN_KEY = "paperidea_access_token";

export function getStoredAccessToken() {
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
}

export interface AiProviderInfo {
  id: string;
  label: string;
  models: string[];
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

export function storeAccessToken(token: string) {
  if (token) window.sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

function authenticatedHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const token = getStoredAccessToken();
  // Headers.set / XHR.setRequestHeader 拒绝 ISO-8859-1 之外的字符;
  // 旧版本曾把中文姓名嵌进 token,导致创建项目等调用直接抛 TypeError。
  // 这里做兜底:任何含中文 / emoji 的坏 token 一律丢弃,前端走 401 流程。
  if (token && isIso88591Safe(token)) headers.set("authorization", `Bearer ${token}`);
  return headers;
}

export function isIso88591Safe(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 0xff) return false;
  }
  return true;
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

export async function syncProject(project: { id: string; name: string; description: string }) {
  return parseResponse<{ id: string }>(await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
    method: "PUT", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(project),
  }));
}

export async function uploadPaperFile(paperId: string, file: Blob, onProgress?: (progress: number) => void) {
  return new Promise<{ paperId: string; size: number; cloudStored: boolean }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", `/api/papers/${encodeURIComponent(paperId)}/file`);
    const token = getStoredAccessToken();
    if (token && isIso88591Safe(token)) request.setRequestHeader("authorization", `Bearer ${token}`);
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

export async function patchProject(projectId: string, patch: { name?: string; description?: string }): Promise<{ project: RemoteProject }> {
  return parseResponse(await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH", headers: authenticatedHeaders({ "content-type": "application/json" }), body: JSON.stringify(patch),
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

// ----------------------------------------------------------------------------
// 用户管理(仅 admin)
// ----------------------------------------------------------------------------

export interface RemoteUser {
  id: string;
  name: string;
  role: "admin" | "researcher";
  createdAt: string;
}

export async function listUsers(): Promise<{ users: RemoteUser[] }> {
  return parseResponse(await fetch("/api/users", { headers: authenticatedHeaders() }));
}

export async function createUser(input: { name: string; password: string; role?: "admin" | "researcher" }): Promise<{ user: RemoteUser }> {
  return parseResponse(await fetch("/api/users", {
    method: "POST",
    headers: authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(input),
  }));
}

export async function patchUser(userId: string, patch: { password?: string; role?: "admin" | "researcher" }): Promise<{ user: RemoteUser }> {
  return parseResponse(await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: authenticatedHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(patch),
  }));
}

export async function deleteUser(userId: string): Promise<{ userId: string; deleted: true }> {
  return parseResponse(await fetch(`/api/users/${encodeURIComponent(userId)}`, {
    method: "DELETE", headers: authenticatedHeaders(),
  }));
}

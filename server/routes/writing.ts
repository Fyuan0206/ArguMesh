import { readFile } from "node:fs/promises";
import { and, eq, or } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { proposePaperPatch } from "../ai/capabilities";
import {
  createSnapshot,
  containsDangerousLatex,
  findMissingCitations,
  initializePaper,
  listSnapshots,
  PAPER_FILES,
  PaperWorkspaceError,
  parseOutline,
  readPaperSource,
  restoreSnapshot,
  writePaperSource,
} from "../services/paper-files";
import { assembleProjectContext } from "../services/project-context";
import { cancelCompile, compilePaper, detectLatexEngine, getCompileStatus, getPaperPdfPath } from "../services/latex";
import { resolveAiForRequest } from "../services/ai";
import type { AppEnv } from "../types";
import { createDatabase } from "../db/client";
import { aiActions } from "../db/schema";

const fileSchema = z.enum(PAPER_FILES);
const sourceWriteSchema = z.object({ content: z.string().max(1_000_000), expectedVersion: z.string().length(64) });
const patchSchema = z.object({
  instruction: z.string().trim().min(1).max(8_000), baseVersion: z.string().length(64),
  selection: z.object({ start: z.number().int().min(0), end: z.number().int().min(0).max(1_000_000) }).optional(),
  provider: z.string().max(100).optional(), model: z.string().max(200).optional(),
});

export const writingRoutes = new Hono<AppEnv>();

writingRoutes.post("/projects/:projectId/paper/initialize", async (c) => {
  try { return c.json(await initializePaper(c.env, c.req.param("projectId")), 201); }
  catch (error) { return paperError(c, error); }
});

writingRoutes.get("/projects/:projectId/paper/source", async (c) => {
  const parsed = fileSchema.safeParse(c.req.query("file") ?? "main.tex");
  if (!parsed.success) return c.json({ error: "INVALID_PAPER_FILE" }, 400);
  try {
    const source = await readPaperSource(c.env, c.req.param("projectId"), parsed.data);
    if (parsed.data === "main.tex") {
      const bibliography = await readPaperSource(c.env, c.req.param("projectId"), "references.bib").catch(() => null);
      return c.json({ ...source, missingCitations: bibliography ? findMissingCitations(source.content, bibliography.content) : [] });
    }
    return c.json(source);
  } catch (error) { return paperError(c, error); }
});

writingRoutes.put("/projects/:projectId/paper/source", async (c) => {
  const file = fileSchema.safeParse(c.req.query("file") ?? "main.tex");
  const body = sourceWriteSchema.safeParse(await c.req.json().catch(() => null));
  if (!file.success || !body.success) return c.json({ error: "INVALID_PAPER_SOURCE", issues: body.success ? [] : body.error.issues }, 400);
  try { return c.json(await writePaperSource(c.env, c.req.param("projectId"), file.data, body.data.content, body.data.expectedVersion)); }
  catch (error) { return paperError(c, error); }
});

writingRoutes.get("/projects/:projectId/paper/outline", async (c) => {
  try { const source = await readPaperSource(c.env, c.req.param("projectId"), "main.tex"); return c.json({ outline: parseOutline(source.content), version: source.version }); }
  catch (error) { return paperError(c, error); }
});

/** AI 只返回候选 LaTeX；接受动作必须另走带 expectedVersion 的 PUT。 */
writingRoutes.post("/projects/:projectId/paper/patch", async (c) => {
  const projectId = c.req.param("projectId");
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "INVALID_PAPER_PATCH", issues: parsed.error.issues }, 400);
  try {
    const source = await readPaperSource(c.env, projectId, "main.tex");
    if (source.version !== parsed.data.baseVersion) return c.json({ error: "PAPER_VERSION_CONFLICT", message: "原文已变化，请刷新后重新生成 Diff" }, 409);
    const context = await assembleProjectContext(c.env, projectId);
    if (!context) return c.json({ error: "PROJECT_NOT_FOUND" }, 404);
    const resolution = await resolveAiForRequest(c.env, { provider: parsed.data.provider, model: parsed.data.model });
    if ("error" in resolution) return c.json({ error: resolution.error.code, message: resolution.error.message }, 400);
    const generated = await proposePaperPatch(c.env, {
      context, source: source.content, instruction: parsed.data.instruction, selection: parsed.data.selection,
      providerConfig: resolution.provider, model: resolution.model,
    });
    if (containsDangerousLatex(generated.data.proposedSource)) return c.json({ error: "UNSAFE_LATEX_PATCH", message: "候选内容包含不允许的文件或命令执行指令，未应用" }, 422);
    const allowedIds = new Set([
      ...context.literature.map((item) => item.id), ...context.researchThread.questions.map((item) => item.id),
      ...context.researchThread.knowledge.map((item) => item.id), ...context.researchThread.gaps.map((item) => item.id),
      ...context.researchThread.ideas.map((item) => item.id), ...context.experiments.flatMap((item) => [item.id, ...item.results.map((result) => result.id)]),
      ...context.evidenceMatrices.flatMap((matrix) => [matrix.id, ...matrix.cells.map((cell) => cell.id)]),
    ]);
    return c.json({
      patch: { ...generated.data, citations: generated.data.citations.filter((citation) => allowedIds.has(citation.id)) },
      baseVersion: source.version, model: generated.model, generatedAt: generated.generatedAt,
    });
  } catch (error) { return paperError(c, error); }
});

/** 从持久项目对话打开一个尚未应用的论文 Diff 提案。 */
writingRoutes.get("/projects/:projectId/paper/proposals/:actionId", async (c) => {
  const row = await createDatabase(c.env).select({ outputJson: aiActions.outputJson, status: aiActions.status, toolName: aiActions.toolName }).from(aiActions)
    .where(and(
      eq(aiActions.id, c.req.param("actionId")), eq(aiActions.projectId, c.req.param("projectId")),
      or(eq(aiActions.toolName, "paper_patch_propose"), eq(aiActions.toolName, "bibliography_entry_propose")),
    )).get();
  if (!row) return c.json({ error: "PAPER_PROPOSAL_NOT_FOUND" }, 404);
  if (row.status !== "completed") return c.json({ error: "PAPER_PROPOSAL_UNAVAILABLE" }, 409);
  try { return c.json({ ...JSON.parse(row.outputJson), toolName: row.toolName }); }
  catch { return c.json({ error: "PAPER_PROPOSAL_INVALID" }, 500); }
});

writingRoutes.get("/projects/:projectId/paper/bibliography", async (c) => {
  try { return c.json(await readPaperSource(c.env, c.req.param("projectId"), "references.bib")); }
  catch (error) { return paperError(c, error); }
});
writingRoutes.put("/projects/:projectId/paper/bibliography", async (c) => {
  const body = sourceWriteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "INVALID_BIBLIOGRAPHY", issues: body.error.issues }, 400);
  try { return c.json(await writePaperSource(c.env, c.req.param("projectId"), "references.bib", body.data.content, body.data.expectedVersion)); }
  catch (error) { return paperError(c, error); }
});

writingRoutes.post("/projects/:projectId/paper/compile", async (c) => {
  try { return c.json(await compilePaper(c.env, c.req.param("projectId"))); }
  catch (error) { return paperError(c, error); }
});
writingRoutes.post("/projects/:projectId/paper/compile/cancel", async (c) => c.json({ cancelled: await cancelCompile(c.req.param("projectId")) }));
writingRoutes.get("/projects/:projectId/paper/compile-status", async (c) => {
  try {
    const [status, engine] = await Promise.all([getCompileStatus(c.env, c.req.param("projectId")), detectLatexEngine(c.env)]);
    return c.json({ ...status, availableEngine: engine?.kind ?? null });
  } catch (error) { return paperError(c, error); }
});
writingRoutes.get("/projects/:projectId/paper/pdf", async (c) => {
  try {
    const pdfPath = await getPaperPdfPath(c.env, c.req.param("projectId"));
    return new Response(await readFile(pdfPath), { headers: { "content-type": "application/pdf", "cache-control": "no-store", "content-disposition": "inline; filename=main.pdf" } });
  } catch (error) { return paperError(c, error); }
});

writingRoutes.get("/projects/:projectId/paper/snapshots", async (c) => {
  try { return c.json({ snapshots: await listSnapshots(c.env, c.req.param("projectId")) }); }
  catch (error) { return paperError(c, error); }
});
writingRoutes.post("/projects/:projectId/paper/snapshots/:snapshotId/restore", async (c) => {
  try { return c.json(await restoreSnapshot(c.env, c.req.param("projectId"), c.req.param("snapshotId"))); }
  catch (error) { return paperError(c, error); }
});
writingRoutes.post("/projects/:projectId/paper/snapshots", async (c) => {
  try { return c.json(await createSnapshot(c.env, c.req.param("projectId"), "manual"), 201); }
  catch (error) { return paperError(c, error); }
});

function paperError(c: Context<AppEnv>, error: unknown) {
  if (error instanceof PaperWorkspaceError) {
    const status = error.code === "PAPER_VERSION_CONFLICT" ? 409 : error.code.includes("NOT_FOUND") || error.code === "PROJECT_NOT_FOUND" ? 404 : error.code === "WORKSPACE_PATH_REQUIRED" ? 409 : 400;
    return c.json({ error: error.code, message: error.message }, status);
  }
  return c.json({ error: "PAPER_OPERATION_FAILED", message: error instanceof Error ? error.message : "论文操作失败" }, 500);
}

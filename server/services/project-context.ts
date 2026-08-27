import { asc, desc, eq, inArray } from "drizzle-orm";
import { createDatabase } from "../db/client";
import {
  experimentResults,
  experiments,
  dimensions,
  evidenceCells,
  gaps,
  ideas,
  knowledgeItems,
  matrices,
  matrixPapers,
  papers,
  projectPapers,
  projects,
  researchQuestions,
} from "../db/schema";
import type { AppBindings } from "../types";
import { readPaperSource } from "./paper-files";
import { detectLatexEngine, getCompileStatus } from "./latex";

/** 每类资产都有明确上限，避免把整个项目无界塞入一次 Agent 回合。 */
export const PROJECT_CONTEXT_LIMITS = {
  papers: 40,
  insights: 60,
  questions: 30,
  experiments: 20,
  resultsPerExperiment: 8,
  matrices: 12,
  matrixDimensions: 120,
  matrixCells: 240,
} as const;

export async function assembleProjectContext(env: AppBindings, projectId: string) {
  const db = createDatabase(env);
  const project = await db.select({ id: projects.id, name: projects.name, description: projects.description, workspacePath: projects.workspacePath })
    .from(projects).where(eq(projects.id, projectId)).get();
  if (!project) return null;

  const literatureRows = await db.select({
    id: papers.id, title: papers.title, authors: papers.authors, venue: papers.venue, year: papers.year,
    abstract: papers.abstract, readingStatus: papers.readingStatus, tagsJson: papers.tagsJson,
  })
    .from(projectPapers).innerJoin(papers, eq(projectPapers.paperId, papers.id))
    .where(eq(projectPapers.projectId, projectId)).limit(PROJECT_CONTEXT_LIMITS.papers);
  const literature = literatureRows.map((row) => ({ ...row, tags: parseJson<string[]>(row.tagsJson, []), tagsJson: undefined }));
  const [knowledge, gapRows, ideaRows, questions, experimentRows, matrixRows] = await Promise.all([
    db.select({ id: knowledgeItems.id, kind: knowledgeItems.kind, title: knowledgeItems.title, content: knowledgeItems.content, paperId: knowledgeItems.paperId, status: knowledgeItems.status })
      .from(knowledgeItems).where(eq(knowledgeItems.projectId, projectId)).orderBy(desc(knowledgeItems.createdAt)).limit(PROJECT_CONTEXT_LIMITS.insights),
    db.select({ id: gaps.id, title: gaps.title, description: gaps.description, status: gaps.status, paperId: gaps.paperId })
      .from(gaps).where(eq(gaps.projectId, projectId)).orderBy(desc(gaps.createdAt)).limit(PROJECT_CONTEXT_LIMITS.insights),
    db.select({ id: ideas.id, title: ideas.title, summary: ideas.summary, status: ideas.status })
      .from(ideas).where(eq(ideas.projectId, projectId)).orderBy(desc(ideas.createdAt)).limit(PROJECT_CONTEXT_LIMITS.insights),
    db.select({ id: researchQuestions.id, question: researchQuestions.question, goal: researchQuestions.goal, status: researchQuestions.status })
      .from(researchQuestions).where(eq(researchQuestions.projectId, projectId)).orderBy(desc(researchQuestions.createdAt)).limit(PROJECT_CONTEXT_LIMITS.questions),
    db.select({ id: experiments.id, title: experiments.title, rqId: experiments.rqId, configJson: experiments.configJson, source: experiments.source, status: experiments.status })
      .from(experiments).where(eq(experiments.projectId, projectId)).orderBy(desc(experiments.createdAt)).limit(PROJECT_CONTEXT_LIMITS.experiments),
    db.select({ id: matrices.id, name: matrices.name, description: matrices.description, extractionProgress: matrices.extractionProgress })
      .from(matrices).where(eq(matrices.projectId, projectId)).orderBy(desc(matrices.createdAt)).limit(PROJECT_CONTEXT_LIMITS.matrices),
  ]);
  const matrixIds = matrixRows.map((row) => row.id);
  const [dimensionRows, matrixPaperRows, matrixCellRows] = matrixIds.length ? await Promise.all([
    db.select({ id: dimensions.id, matrixId: dimensions.matrixId, groupLabel: dimensions.groupLabel, label: dimensions.label, sortOrder: dimensions.sortOrder })
      .from(dimensions).where(inArray(dimensions.matrixId, matrixIds)).orderBy(asc(dimensions.sortOrder)).limit(PROJECT_CONTEXT_LIMITS.matrixDimensions),
    db.select({ matrixId: matrixPapers.matrixId, paperId: matrixPapers.paperId, sortOrder: matrixPapers.sortOrder })
      .from(matrixPapers).where(inArray(matrixPapers.matrixId, matrixIds)).orderBy(asc(matrixPapers.sortOrder)),
    db.select({
      id: evidenceCells.id, matrixId: evidenceCells.matrixId, paperId: evidenceCells.paperId, dimensionId: evidenceCells.dimensionId,
      value: evidenceCells.value, status: evidenceCells.status, confidence: evidenceCells.confidence, claim: evidenceCells.claim,
      sourcePage: evidenceCells.sourcePage, sourceSection: evidenceCells.sourceSection, sourceExcerpt: evidenceCells.sourceExcerpt,
    }).from(evidenceCells).where(inArray(evidenceCells.matrixId, matrixIds)).limit(PROJECT_CONTEXT_LIMITS.matrixCells),
  ]) : [[], [], []];
  const experimentIds = experimentRows.map((row) => row.id);
  const resultRows = experimentIds.length ? await db.select({
    id: experimentResults.id, experimentId: experimentResults.experimentId, sourceName: experimentResults.sourceName,
    normalizedDataJson: experimentResults.normalizedDataJson, analysisJson: experimentResults.analysisJson,
  }).from(experimentResults).where(inArray(experimentResults.experimentId, experimentIds)).orderBy(desc(experimentResults.createdAt)) : [];
  const resultsByExperiment = new Map<string, typeof resultRows>();
  for (const row of resultRows) {
    const existing = resultsByExperiment.get(row.experimentId) ?? [];
    if (existing.length < PROJECT_CONTEXT_LIMITS.resultsPerExperiment) resultsByExperiment.set(row.experimentId, [...existing, row]);
  }

  let paper: { source: string; version: string; bibliography: string; bibliographyVersion: string } | null = null;
  try {
    const [source, bibliography] = await Promise.all([readPaperSource(env, projectId, "main.tex"), readPaperSource(env, projectId, "references.bib")]);
    paper = { source: source.content.slice(0, 300_000), version: source.version, bibliography: bibliography.content.slice(0, 150_000), bibliographyVersion: bibliography.version };
  } catch { /* 论文未初始化不阻塞其他 Agent 能力 */ }
  const latexCompileStatus = paper ? await Promise.all([
    getCompileStatus(env, projectId).catch(() => null),
    detectLatexEngine(env).catch(() => null),
  ]).then(([status, engine]) => ({ status, availableEngine: engine?.kind ?? null })) : null;

  return {
    project,
    literature,
    evidenceMatrices: matrixRows.map((matrix) => ({
      ...matrix,
      paperIds: matrixPaperRows.filter((row) => row.matrixId === matrix.id).map((row) => row.paperId),
      dimensions: dimensionRows.filter((row) => row.matrixId === matrix.id),
      cells: matrixCellRows.filter((row) => row.matrixId === matrix.id),
    })),
    researchThread: { knowledge, gaps: gapRows, ideas: ideaRows, questions },
    experiments: experimentRows.map((row) => ({
      id: row.id, title: row.title, rqId: row.rqId, source: row.source, status: row.status,
      design: parseJson(row.configJson, {}),
      results: (resultsByExperiment.get(row.id) ?? []).map((result) => ({
        id: result.id, sourceName: result.sourceName,
        rows: parseJson<Array<Record<string, unknown>>>(result.normalizedDataJson, []).slice(0, 80),
        analysis: result.analysisJson ? parseJson(result.analysisJson, null) : null,
      })),
    })),
    paper,
    latexCompileStatus,
    limits: PROJECT_CONTEXT_LIMITS,
  };
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

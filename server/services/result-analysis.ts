import { eq } from "drizzle-orm";
import type { z } from "zod";
import { resultAnalysisSchema } from "../ai/capabilities";
import { createDatabase } from "../db/client";
import { experimentResults, researchQuestionConclusions } from "../db/schema";
import type { AppBindings } from "../types";

export type ResultAnalysis = z.infer<typeof resultAnalysisSchema>;

export function analysisReferencesExist(analysis: ResultAnalysis, rows: Array<Record<string, unknown>>): boolean {
  return [...analysis.findings, ...analysis.ablationFindings, ...analysis.anomalies].every((item) => item.evidenceRefs.every((ref) => {
    const row = rows[ref.row - 1];
    return Boolean(row && Object.prototype.hasOwnProperty.call(row, ref.field));
  }));
}

/** 保存结果分析草稿，并把每次分析 append-only 回挂为研究问题结论。 */
export async function persistResultAnalysisDraft(env: AppBindings, input: {
  projectId: string;
  experimentId: string;
  rqId: string | null;
  resultId: string;
  analysis: ResultAnalysis;
  model: string | null;
  generatedAt: string;
}) {
  const db = createDatabase(env);
  const conclusion = input.rqId ? {
    id: crypto.randomUUID(), projectId: input.projectId, rqId: input.rqId,
    experimentId: input.experimentId, resultId: input.resultId,
    summary: input.analysis.summary, supportLevel: input.analysis.supportLevel,
    limitationsJson: JSON.stringify(input.analysis.limitations), source: "ai" as const, status: "draft" as const,
    model: input.model, generatedAt: input.generatedAt, createdAt: new Date().toISOString(),
  } : null;
  await db.transaction(async (tx) => {
    await tx.update(experimentResults).set({
      analysisJson: JSON.stringify(input.analysis), analysisStatus: "draft",
      model: input.model, generatedAt: input.generatedAt,
    }).where(eq(experimentResults.id, input.resultId));
    if (conclusion) await tx.insert(researchQuestionConclusions).values(conclusion);
  });
  return conclusion;
}

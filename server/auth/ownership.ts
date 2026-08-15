import { and, eq } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { evidenceCells, matrices, papers, projects } from "../db/schema";
import type { AppBindings } from "../types";
import type { AccountId } from "./session";

export async function findOwnedProject(env: AppBindings, accountId: AccountId, projectId: string) {
  return createDatabase(env).select().from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.ownerId, accountId))).get();
}

export async function findOwnedPaper(env: AppBindings, accountId: AccountId, paperId: string) {
  return createDatabase(env).select().from(papers)
    .where(and(eq(papers.id, paperId), eq(papers.ownerId, accountId))).get();
}

export async function findOwnedMatrix(env: AppBindings, accountId: AccountId, matrixId: string) {
  const db = createDatabase(env);
  return db.select({ matrix: matrices }).from(matrices)
    .innerJoin(projects, eq(matrices.projectId, projects.id))
    .where(and(eq(matrices.id, matrixId), eq(projects.ownerId, accountId))).get();
}

export async function findOwnedEvidence(env: AppBindings, accountId: AccountId, evidenceId: string) {
  const db = createDatabase(env);
  return db.select({ evidence: evidenceCells }).from(evidenceCells)
    .innerJoin(projects, eq(evidenceCells.projectId, projects.id))
    .where(and(eq(evidenceCells.id, evidenceId), eq(projects.ownerId, accountId))).get();
}

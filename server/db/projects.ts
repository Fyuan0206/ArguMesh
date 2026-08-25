import { eq } from "drizzle-orm";
import { createDatabase } from "./client";
import { projects } from "./schema";
import type { AppBindings } from "../types";

/**
 * 单用户本地版:仅校验项目是否存在(无账号归属概念)。
 * 替代旧 auth/ownership 的 findOwnedProject,供路由做 404 存在性检查。
 */
export async function projectExists(env: AppBindings, projectId: string): Promise<boolean> {
  const db = createDatabase(env);
  return Boolean(await db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get());
}

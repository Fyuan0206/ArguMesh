import { asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { hashPassword } from "../auth/password";
import { createDatabase } from "../db/client";
import { accounts, papers, projects } from "../db/schema";
import type { AppEnv } from "../types";

/**
 * 用户管理(仅 admin)。
 * 鉴权中间件已把当前角色写入 c.var.accountRole(每次请求实时读取数据库)。
 */

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(64),
  password: z.string().min(6).max(128),
  role: z.enum(["admin", "researcher"]).optional(),
});

const updateUserSchema = z.object({
  password: z.string().min(6).max(128).optional(),
  role: z.enum(["admin", "researcher"]).optional(),
});

export const userRoutes = new Hono<AppEnv>();

userRoutes.use("*", async (c, next) => {
  if (c.get("accountRole") !== "admin") {
    return c.json({ error: "FORBIDDEN", message: "仅管理员可以管理用户" }, 403);
  }
  return next();
});

function publicUser(account: { id: string; name: string; role: "admin" | "researcher"; createdAt: string }) {
  return { id: account.id, name: account.name, role: account.role, createdAt: account.createdAt };
}

userRoutes.get("/users", async (c) => {
  const db = createDatabase(c.env);
  const rows = await db.select().from(accounts).orderBy(asc(accounts.createdAt));
  return c.json({ users: rows.map(publicUser) });
});

userRoutes.post("/users", async (c) => {
  const parsed = createUserSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_USER", message: "用户名 1–64 字符,密码至少 6 位", issues: parsed.error.issues }, 400);
  }
  const db = createDatabase(c.env);
  const existing = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.name, parsed.data.name)).get();
  if (existing) return c.json({ error: "USER_EXISTS", message: "该用户名已存在" }, 409);
  const user = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    role: parsed.data.role ?? "researcher",
    createdAt: new Date().toISOString(),
  };
  await db.insert(accounts).values({ ...user, passwordHash: await hashPassword(parsed.data.password) });
  return c.json({ user }, 201);
});

userRoutes.patch("/users/:userId", async (c) => {
  const parsed = updateUserSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || (!parsed.data.password && !parsed.data.role)) {
    return c.json({ error: "INVALID_USER", message: "请提供要修改的密码或角色" }, 400);
  }
  const db = createDatabase(c.env);
  const userId = c.req.param("userId");
  const existing = await db.select().from(accounts).where(eq(accounts.id, userId)).get();
  if (!existing) return c.json({ error: "USER_NOT_FOUND", message: "用户不存在" }, 404);
  const patch: { passwordHash?: string; role?: "admin" | "researcher" } = {};
  if (parsed.data.password) patch.passwordHash = await hashPassword(parsed.data.password);
  if (parsed.data.role) patch.role = parsed.data.role;
  await db.update(accounts).set(patch).where(eq(accounts.id, userId));
  return c.json({ user: { ...publicUser(existing), ...(patch.role ? { role: patch.role } : {}) } });
});

userRoutes.delete("/users/:userId", async (c) => {
  const db = createDatabase(c.env);
  const userId = c.req.param("userId");
  if (userId === c.get("accountId")) {
    return c.json({ error: "CANNOT_DELETE_SELF", message: "不能删除当前登录的账户" }, 400);
  }
  const existing = await db.select().from(accounts).where(eq(accounts.id, userId)).get();
  if (!existing) return c.json({ error: "USER_NOT_FOUND", message: "用户不存在" }, 404);
  if (existing.role === "admin") {
    const result = await db.select({ count: sql<number>`count(*)` }).from(accounts).where(eq(accounts.role, "admin"));
    if ((result[0]?.count ?? 0) <= 1) {
      return c.json({ error: "LAST_ADMIN", message: "至少保留一个管理员账户" }, 400);
    }
  }
  // 连同该账户的数据一并清理(项目/论文均有级联外键,evidence_cells 等随之删除)。
  await db.delete(projects).where(eq(projects.ownerId, userId));
  await db.delete(papers).where(eq(papers.ownerId, userId));
  await db.delete(accounts).where(eq(accounts.id, userId));
  return c.json({ userId, deleted: true });
});

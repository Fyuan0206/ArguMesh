import { Hono } from "hono";
import { z } from "zod";
import { HTTPException } from "hono/http-exception";
import { createSessionToken, verifyAccount } from "../auth/session";
import type { AppEnv } from "../types";

/**
 * 登录路由。
 *
 * 设计目标:
 *  - 校验数据库中的账户(用户名 + PBKDF2 口令哈希),通过则返回与 `APP_ACCESS_TOKEN` 等效的 token,
 *    让前端无需自己派生 / 持有真实的 APP_ACCESS_TOKEN。
 *  - 该端点对所有人开放(不挂全局 bearer 中间件),失败响应 401 + 通用文案,避免账户名探测。
 *
 * 安全前提:
 *  - 账户存于数据库,默认种子 admin/admin123;管理员通过 /api/users 为他人创建账户。
 *  - 前端 token 只放在 sessionStorage,关闭标签页即销毁,无法长期持有。
 *  - 部署到公网前务必修改默认密码,并在 .env 显式设置 APP_ACCESS_TOKEN。
 */

const loginSchema = z.object({
  name: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/login", async (c) => {
  let body: unknown;
  try {
    // 直接读 raw 字节流并用 TextDecoder UTF-8 解码,绕开 c.req.text() / c.req.json()
    // 在某些部署环境按 latin-1 解码导致中文姓名被解读为 mojibake 的问题。
    // 客户端必须发送 Content-Type: application/json; charset=utf-8(或省略 charset,
    // 因为 RFC 8259 规定 application/json 的默认编码是 UTF-8)。
    const buf = await c.req.raw.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    body = JSON.parse(text);
  } catch {
    throw new HTTPException(400, { message: "请求体必须为 JSON" });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: "用户名或密码格式不正确" });
  }
  const { name, password } = parsed.data;
  const account = await verifyAccount(c.env, name, password);
  if (!account) {
    throw new HTTPException(401, { message: "用户名或密码不正确" });
  }
  if (!c.env.APP_ACCESS_TOKEN) {
    throw new HTTPException(500, { message: "服务器访问令牌未配置" });
  }
  const token = await createSessionToken(account, c.env.APP_ACCESS_TOKEN);
  return c.json({
    token,
    user: account,
  });
});

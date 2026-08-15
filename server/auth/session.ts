import { eq } from "drizzle-orm";
import { createDatabase } from "../db/client";
import { accounts } from "../db/schema";
import type { AppBindings, AccountRole } from "../types";
import { verifyPassword } from "./password";

export type AccountId = string;

export interface AccountIdentity {
  id: AccountId;
  name: string;
  role: AccountRole;
}

interface SessionPayload extends AccountIdentity {
  exp: number;
}

/**
 * 登录校验:按用户名查库并校验 PBKDF2 口令哈希。
 * 账户由管理员通过 /api/users 创建(默认种子 admin/admin123)。
 */
export async function verifyAccount(env: AppBindings, name: string, password: string): Promise<AccountIdentity | null> {
  const db = createDatabase(env);
  const account = await db.select().from(accounts).where(eq(accounts.name, name.trim())).get();
  if (!account) return null;
  if (!(await verifyPassword(password, account.passwordHash))) return null;
  return { id: account.id, name: account.name, role: account.role };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importSigningKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

export async function createSessionToken(account: AccountIdentity, secret: string): Promise<string> {
  const payload: SessionPayload = { ...account, exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60 };
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return `${encodedPayload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string, secret: string, env: AppBindings): Promise<AccountIdentity | null> {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  try {
    const key = await importSigningKey(secret, ["verify"]);
    const signatureBytes = base64UrlDecode(encodedSignature);
    const signature = signatureBytes.buffer.slice(signatureBytes.byteOffset, signatureBytes.byteOffset + signatureBytes.byteLength) as ArrayBuffer;
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as SessionPayload;
    if (!Number.isFinite(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    // 会话有效性以数据库为准:账户被删除后旧 token 立即失效,角色变更实时生效。
    const db = createDatabase(env);
    const account = await db
      .select({ id: accounts.id, name: accounts.name, role: accounts.role })
      .from(accounts)
      .where(eq(accounts.id, payload.id))
      .get();
    if (!account || account.name !== payload.name) return null;
    return { id: account.id, name: account.name, role: account.role };
  } catch {
    return null;
  }
}

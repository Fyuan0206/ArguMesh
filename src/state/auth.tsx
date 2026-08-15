import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getStoredAccessToken, storeAccessToken } from "../api";

export type AccountRole = "admin" | "researcher";

/**
 * 登录会话(三件套)。
 *  - accessToken: 调本地 /api/* 用的 Bearer;由后端 /api/login 校验姓名密码后下发,
 *    与部署时的 APP_ACCESS_TOKEN 等效。前端不需要自己派生,也不持有任何长期 secret。
 *  - displayName: 显示在侧边栏 / Settings 的当前用户姓名。
 *  - role: 当前账号角色(目前都是 Researcher)。
 *
 * 整段会话放在 sessionStorage,关闭标签页即登出;跨标签页通过 storage 事件同步。
 */
export interface Session {
  accessToken: string;
  accountId: string;
  displayName: string;
  role: AccountRole;
}

const SESSION_DISPLAY_KEY = "paperidea_session_display";
const SESSION_ROLE_KEY = "paperidea_session_role";
const SESSION_ACCOUNT_KEY = "paperidea_session_account";

function readSession(): Session | null {
  const token = getStoredAccessToken();
  const displayName = window.sessionStorage.getItem(SESSION_DISPLAY_KEY) ?? "";
  const accountId = window.sessionStorage.getItem(SESSION_ACCOUNT_KEY) ?? "";
  // 姓名 + 角色都是登录后由 AuthProvider 写入;没有姓名就视为「未走新登录流程」,
  // 旧 token 仅可访问 /api/*,但前端 UI 仍按未登录展示(因为还没有用户身份)。
  if (!displayName || !accountId) return null;
  const role = (window.sessionStorage.getItem(SESSION_ROLE_KEY) as Session["role"] | null) ?? "researcher";
  return { accessToken: token, accountId, displayName, role };
}

interface SignInError {
  /** 面向用户的错误提示。 */
  message: string;
  /** 用于埋点 / 重试判断的代码。 */
  code: "INVALID_CREDENTIALS" | "NETWORK" | "SERVER" | "BAD_RESPONSE";
}

export type { SignInError };

interface AuthContextValue {
  session: Session | null;
  hasToken: boolean;
  /**
   * 异步登录。成功后 token 写入 sessionStorage 并切换 session,返回 null;
   * 失败返回 { message, code },由 AccessGate 展示对应文案。
   */
  signIn(name: string, password: string): Promise<SignInError | null>;
  signOut(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

interface LoginResponse {
  token: string;
  user: { id: string; name: string; role: AccountRole };
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(() => readSession());

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      hasToken: session !== null,
      async signIn(name, password) {
        const trimmedName = name.trim();
        if (!trimmedName) return { message: "请输入姓名", code: "INVALID_CREDENTIALS" };
        if (!password) return { message: "请输入密码", code: "INVALID_CREDENTIALS" };
        let response: Response;
        try {
          response = await fetch("/api/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: trimmedName, password }),
          });
        } catch (error) {
          return {
            message: "网络异常,无法连接到工作台后端。请检查网络后重试。",
            code: "NETWORK",
          };
        }
        if (response.status === 401) {
          return { message: "姓名或密码不正确,请检查后重试", code: "INVALID_CREDENTIALS" };
        }
        if (!response.ok) {
          let detail = "";
          try {
            const payload = (await response.json()) as { message?: string };
            detail = payload.message ?? "";
          } catch {
            /* 响应不是 JSON,忽略 */
          }
          return {
            message: detail || `登录失败 (${response.status})`,
            code: "SERVER",
          };
        }
        let payload: LoginResponse;
        try {
          payload = (await response.json()) as LoginResponse;
        } catch {
          return { message: "服务器返回格式异常,请稍后重试", code: "BAD_RESPONSE" };
        }
        if (!payload?.token || !payload?.user?.id || !payload?.user?.name) {
          return { message: "服务器返回格式异常,请稍后重试", code: "BAD_RESPONSE" };
        }
        // 服务端下发的 token 才是真正能通过 /api/* 鉴权的值,绝不能在前端派生。
        storeAccessToken(payload.token);
        window.sessionStorage.setItem(SESSION_DISPLAY_KEY, payload.user.name);
        window.sessionStorage.setItem(SESSION_ROLE_KEY, payload.user.role);
        window.sessionStorage.setItem(SESSION_ACCOUNT_KEY, payload.user.id);
        setSession({
          accessToken: payload.token,
          accountId: payload.user.id,
          displayName: payload.user.name,
          role: payload.user.role,
        });
        return null;
      },
      signOut() {
        storeAccessToken("");
        window.sessionStorage.removeItem(SESSION_DISPLAY_KEY);
        window.sessionStorage.removeItem(SESSION_ROLE_KEY);
        window.sessionStorage.removeItem(SESSION_ACCOUNT_KEY);
        setSession(null);
      },
    }),
    [session],
  );

  // 跨标签页同步:另一个标签页登出 / 切换账号时,本标签页同步更新。
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === "paperidea_access_token" || event.key === SESSION_DISPLAY_KEY || event.key === SESSION_ROLE_KEY || event.key === SESSION_ACCOUNT_KEY) {
        setSession(readSession());
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}

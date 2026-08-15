import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { isIso88591Safe, getStoredAccessToken, storeAccessToken } from "../../src/api";
import { AuthProvider, useAuth, type AccountRole, type SignInError } from "../../src/state/auth";

interface LoginResponseBody {
  token: string;
  user: { id: string; name: string; role: AccountRole };
}

function mockLoginEndpoint(handler: (body: { name: string; password: string }) => Promise<{ status: number; body: unknown }>) {
  return vi.spyOn(window, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url !== "/api/login") {
      return new Response("not mocked", { status: 404 });
    }
    const parsed = JSON.parse(String(init?.body ?? "{}")) as { name: string; password: string };
    const result = await handler(parsed);
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { "content-type": "application/json" } });
  });
}

interface AuthHandle {
  signIn: (name: string, password: string) => Promise<SignInError | null>;
}

function AuthCapture({ onReady }: { onReady: (handle: AuthHandle) => void }) {
  const auth = useAuth();
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    onReady({ signIn: auth.signIn });
  }, [auth, onReady]);
  return null;
}

function setupHarness() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let resolveReady: ((handle: AuthHandle) => void) | null = null;
  const ready = new Promise<AuthHandle>((resolve) => {
    resolveReady = resolve;
  });
  act(() => {
    root.render(<AuthProvider><AuthCapture onReady={(handle) => resolveReady?.(handle)} /></AuthProvider>);
  });
  return { host, root, ready };
}

async function flushMicrotasks() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("isIso88591Safe", () => {
  it("accepts ASCII strings", () => {
    expect(isIso88591Safe("sess-abc123")).toBe(true);
    expect(isIso88591Safe("")).toBe(true);
    expect(isIso88591Safe("aA0-_.~/=")).toBe(true);
  });

  it("rejects strings with CJK characters", () => {
    expect(isIso88591Safe("session:中文用户:abc")).toBe(false);
    expect(isIso88591Safe("陈")).toBe(false);
    expect(isIso88591Safe("token-中文-suffix")).toBe(false);
  });

  it("rejects strings with emoji", () => {
    expect(isIso88591Safe("hello 🚀")).toBe(false);
    expect(isIso88591Safe("🔑")).toBe(false);
  });

  it("accepts extended latin-1 (e.g. ñ, é)", () => {
    expect(isIso88591Safe("café")).toBe(true);
    expect(isIso88591Safe("señor")).toBe(true);
  });
});

describe("AuthProvider.signIn", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("stores the token from /api/login and updates the session", async () => {
    mockLoginEndpoint(async (body) => {
      if (body.name === "admin" && body.password === "admin123") {
        return { status: 200, body: { token: "issued-token-1234", user: { id: "account-admin", name: "admin", role: "admin" } } satisfies LoginResponseBody };
      }
      return { status: 401, body: { message: "用户名或密码不正确" } };
    });
    const { root, ready } = setupHarness();
    const handle = await ready;
    const result = await handle.signIn("admin", "admin123");
    await flushMicrotasks();
    expect(result).toBeNull();
    expect(getStoredAccessToken()).toBe("issued-token-1234");
    expect(window.sessionStorage.getItem("paperidea_session_display")).toBe("admin");
    expect(window.sessionStorage.getItem("paperidea_session_account")).toBe("account-admin");
    expect(window.sessionStorage.getItem("paperidea_session_role")).toBe("admin");
    await act(async () => root.unmount());
  });

  it("returns INVALID_CREDENTIALS on 401 and clears the stored token", async () => {
    mockLoginEndpoint(async () => ({ status: 401, body: { message: "用户名或密码不正确" } }));
    const { root, ready } = setupHarness();
    const handle = await ready;
    const result = await handle.signIn("admin", "wrong");
    expect(result?.code).toBe("INVALID_CREDENTIALS");
    expect(getStoredAccessToken()).toBe("");
    await act(async () => root.unmount());
  });

  it("replaces a legacy non-ISO-8859-1 token after successful login", async () => {
    storeAccessToken("session:中文用户:legacy");
    expect(isIso88591Safe(getStoredAccessToken())).toBe(false);
    mockLoginEndpoint(async () => ({ status: 200, body: { token: "fresh-issued-token", user: { id: "account-admin", name: "admin", role: "admin" } } satisfies LoginResponseBody }));
    const { root, ready } = setupHarness();
    const handle = await ready;
    const result = await handle.signIn("admin", "admin123");
    expect(result).toBeNull();
    const refreshed = getStoredAccessToken();
    expect(refreshed).toBe("fresh-issued-token");
    expect(refreshed).not.toContain("中文");
    expect(isIso88591Safe(refreshed)).toBe(true);
    await act(async () => root.unmount());
  });

  it("returns NETWORK error when /api/login fetch rejects", async () => {
    vi.spyOn(window, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const { root, ready } = setupHarness();
    const handle = await ready;
    const result = await handle.signIn("admin", "admin123");
    expect(result?.code).toBe("NETWORK");
    await act(async () => root.unmount());
  });
});

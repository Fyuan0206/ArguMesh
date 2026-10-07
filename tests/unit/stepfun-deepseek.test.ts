import { afterEach, describe, expect, it, vi } from "vitest";
import { createStepFunCompletion } from "../../server/services/stepfun";
import type { AppBindings } from "../../server/types";

afterEach(() => vi.unstubAllGlobals());

describe("text-only DeepSeek completions", () => {
  it("uses DeepSeek's thinking toggle so reasoning cannot consume the whole translation budget", async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "译文" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", request);
    const text = await createStepFunCompletion({} as AppBindings, [{ role: "user", content: "Source" }], {
      model: "deepseek-v4-pro",
      thinkingMode: false,
      providerConfig: { id: "test", label: "DeepSeek", baseUrl: "https://api.deepseek.com", apiKey: "test-only", models: ["deepseek-v4-pro"] },
    });
    expect(text).toBe("译文");
    const body = JSON.parse((request.mock.calls[0][1] as RequestInit).body as string) as Record<string, unknown>;
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body).not.toHaveProperty("thinking_mode");
  });
});

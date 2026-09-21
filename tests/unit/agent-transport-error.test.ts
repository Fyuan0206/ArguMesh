// @vitest-environment node
import { describe, expect, it } from "vitest";
import { normalizeAgentTransportError } from "../../server/routes/conversations";

describe("normalizeAgentTransportError", () => {
  it("maps opaque network failures to a Chinese transport hint", () => {
    expect(normalizeAgentTransportError("network error")).toMatch(/网络连接中断/);
    expect(normalizeAgentTransportError("Failed to fetch")).toMatch(/网络连接中断/);
    expect(normalizeAgentTransportError("fetch failed")).toMatch(/网络连接中断/);
  });

  it("keeps non-transport messages", () => {
    expect(normalizeAgentTransportError("AI_NOT_CONFIGURED")).toBe("AI_NOT_CONFIGURED");
  });
});

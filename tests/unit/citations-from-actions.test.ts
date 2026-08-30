// @vitest-environment node
import { describe, expect, it } from "vitest";
import { citationsFromActions } from "../../server/services/pi-agent";

describe("citationsFromActions", () => {
  it("maps completed whitelist actions with href into citations", () => {
    const citations = citationsFromActions([
      {
        status: "completed",
        toolName: "insight_create_draft",
        output: { id: "ins-1", href: "/projects/p1/research?view=insights" },
      },
      {
        status: "failed",
        toolName: "insight_create_draft",
        output: { id: "ins-2", href: "/projects/p1/research" },
      },
      {
        status: "completed",
        toolName: "research_question_create_draft",
        output: { id: "rq-1", href: "/projects/p1/research?view=questions" },
      },
    ]);
    expect(citations).toEqual([
      {
        kind: "insight",
        id: "ins-1",
        label: "洞见草稿",
        href: "/projects/p1/research?view=insights",
      },
      {
        kind: "research_question",
        id: "rq-1",
        label: "研究问题草稿",
        href: "/projects/p1/research?view=questions",
      },
    ]);
  });

  it("dedupes identical citation keys", () => {
    const action = {
      status: "completed",
      toolName: "latex_compile",
      output: { id: "compile", href: "/projects/p1/writing" },
    };
    expect(citationsFromActions([action, action])).toHaveLength(1);
  });
});

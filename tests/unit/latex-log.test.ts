import { describe, expect, it } from "vitest";
import { parseLatexLog } from "../../server/services/latex";

describe("LaTeX log parser", () => {
  it("extracts errors, warnings and source line numbers", () => {
    const issues = parseLatexLog("! Undefined control sequence.\nl.42 \\badcommand\nLaTeX Warning: Citation `missing' on input line 18 undefined.");
    expect(issues).toEqual([
      { severity: "error", message: "Undefined control sequence.", line: 42 },
      { severity: "warning", message: "LaTeX Warning: Citation `missing' on input line 18 undefined.", line: 18 },
    ]);
  });
});

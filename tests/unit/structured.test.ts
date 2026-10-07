import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeMineruPage } from "../../server/services/mineru";
import { lockTableNumbers, parseStructuredTable, preservesTableNumbers, shouldTranslateTableCell } from "../../src/pdf/structured";

describe("structured PDF page", () => {
  it("locks numeric table values while translating mixed labels", () => {
    const model = lockTableNumbers("Model 1");
    expect(model.masked).toBe("Model __AMVALUEA__");
    expect(model.restore("模型 __AMVALUEA__")).toBe("模型 1");
    expect(model.restore("模型一")).toBeNull();
    const score = lockTableNumbers("Score(mod1): 94%, 0.5");
    expect(score.restore("得分（mod__AMVALUEA__）：__AMVALUEB__，__AMVALUEC__"))
      .toBe("得分（mod1）：94%，0.5");
    expect(preservesTableNumbers("Score(mod1): 94%, 0.5", "得分（mod1）：94%，0.5")).toBe(true);
  });

  it("keeps table rows, numeric values, and row spans without inserting PDF HTML", () => {
    const rows = parseStructuredTable('<table><tr><td>Model</td><td>Overall</td></tr><tr><td rowspan="2">GPT-3.5</td><td>85.3%</td></tr><tr><td>83.3%</td></tr></table><script>throw new Error("injected")</script>');
    expect(rows).toEqual([
      [{ text: "Model", rowSpan: 1, colSpan: 1 }, { text: "Overall", rowSpan: 1, colSpan: 1 }],
      [{ text: "GPT-3.5", rowSpan: 2, colSpan: 1 }, { text: "85.3%", rowSpan: 1, colSpan: 1 }],
      [{ text: "83.3%", rowSpan: 1, colSpan: 1 }],
    ]);
    expect(shouldTranslateTableCell("Overall")).toBe(true);
    expect(shouldTranslateTableCell("85.3%")).toBe(false);
    expect(shouldTranslateTableCell("GPT-3.5")).toBe(false);
    expect(shouldTranslateTableCell("stm+sum+ltm")).toBe(false);
  });

  it("recognizes MinerU V2 tables and display equations", async () => {
    const result = await normalizeMineruPage([[
      { type: "paragraph", content: { paragraph_content: [{ type: "text", content: "Findings." }] }, bbox: [100, 100, 450, 120] },
      { type: "table", content: { table_caption: [{ type: "text", content: "Table 1: Results" }], html: "<table><tr><td>Policy</td></tr></table>" }, bbox: [150, 200, 850, 400] },
      { type: "equation_interline", content: { math_content: "E=mc^2" }, bbox: [600, 500, 800, 530] },
    ]], "unused");
    expect(result.columns).toBe(2);
    expect(result.blocks.map((block) => [block.kind, block.text, block.column])).toEqual([
      ["paragraph", "Findings.", 0],
      ["table", "Table 1: Results", "full"],
      ["formula", "E=mc^2", 1],
    ]);
  });

  it("keeps extracted figure pixels local while exposing caption text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "argumesh-figure-test-"));
    try {
      await mkdir(join(directory, "images"));
      await writeFile(join(directory, "images", "figure.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==", "base64"));
      const result = await normalizeMineruPage([[{ type: "image", content: { image_source: { path: "images/figure.png" }, image_caption: [{ type: "text", content: "Figure 1: Store routing" }] }, bbox: [120, 200, 800, 600] }]], directory);
      expect(result.blocks[0]).toMatchObject({ kind: "image", text: "Figure 1: Store routing", column: "full" });
      expect(result.blocks[0].image).toMatch(/^data:image\/png;base64,/);
      expect(result.blocks[0].imageHash).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

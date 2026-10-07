import { describe, expect, it } from "vitest";
import { layoutTextItems, type LayoutTextItem } from "../../src/pdf/layout";

function item(str: string, x: number, y: number, width = 420, height = 10): LayoutTextItem {
  return { str, hasEOL: true, transform: [height, 0, 0, height, x, y], width };
}

describe("PDF page layout", () => {
  it("keeps single-column paragraphs and section headings in reading order", () => {
    const layout = layoutTextItems([
      item("Memory Systems. The first line of the paragraph", 72, 710),
      item("continues on the next line.", 72, 699),
      item("Multi-Index and Federated Retrieval. A new paragraph", 72, 681),
      item("3 PROBLEM FORMULATION", 72, 645, 210, 12),
      item("3.1 MEMORY ARCHITECTURE", 72, 617, 190),
      item("A memory store is an independent index.", 72, 593),
    ], 612);
    expect(layout.columns).toBe(1);
    expect(layout.blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph", "heading", "heading", "paragraph"]);
    expect(layout.blocks[0].text).toBe("Memory Systems. The first line of the paragraph continues on the next line.");
    expect(layout.blocks[1].text.startsWith("Multi-Index")).toBe(true);
  });

  it("reads each PDF column from top to bottom even when text items are interleaved", () => {
    const layout = layoutTextItems([
      item("Left one", 45, 700, 200), item("Right one", 320, 700, 200),
      item("Left two", 45, 680, 200), item("Right two", 320, 680, 200),
      item("Left three", 45, 660, 200), item("Right three", 320, 660, 200),
      item("Left four", 45, 640, 200), item("Right four", 320, 640, 200),
    ], 612);
    expect(layout.columns).toBe(2);
    expect(layout.blocks.map((block) => block.text)).toEqual([
      "Left one", "Left two", "Left three", "Left four",
      "Right one", "Right two", "Right three", "Right four",
    ]);
    expect(layout.blocks.map((block) => block.column)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
  });

  it("excludes rotated margin text from the translation source", () => {
    const rotated: LayoutTextItem = { str: "arXiv:watermark", hasEOL: true, transform: [0, 10, -10, 0, 30, 400], width: 100 };
    expect(layoutTextItems([item("Readable body text.", 72, 700), rotated, item("2", 303, 35, 6)], 612, 792).blocks.map((block) => block.text))
      .toEqual(["Readable body text."]);
  });

  it("marks a bold run-in label without splitting its paragraph", () => {
    const label = { ...item("Memory Systems.", 72, 710, 76), hasEOL: false, fontName: "bold" };
    const body = { ...item(" MemGPT maintains memory stores.", 148, 710, 170), fontName: "regular" };
    const layout = layoutTextItems([label, body], 612);
    expect(layout.blocks).toMatchObject([{ text: "Memory Systems. MemGPT maintains memory stores.", kind: "paragraph", leadIn: true }]);
  });
});

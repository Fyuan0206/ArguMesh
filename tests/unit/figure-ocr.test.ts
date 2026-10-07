import { describe, expect, it } from "vitest";
import { readableFigureText } from "../../src/pdf/figureOcr";

describe("readableFigureText", () => {
  it("keeps clear labels and values while dropping low-confidence drawing noise", () => {
    const row = (line: number, index: number, left: number, width: number, confidence: number, text: string) =>
      `5\t1\t1\t1\t${line}\t${index}\t${left}\t10\t${width}\t18\t${confidence}\t${text}`;
    const tsv = [
      row(1, 1, 10, 60, 96, "Coverage"),
      row(1, 2, 75, 30, 96, "94%"),
      row(1, 3, 210, 45, 5, "EEE"),
      row(1, 4, 280, 55, 94, "Recall"),
      row(2, 1, 10, 20, 94, "8%"),
      row(3, 1, 10, 40, 94, "Store"),
      row(3, 2, 50, 20, 92, "42"),
    ].join("\n");
    expect(readableFigureText(tsv)).toBe("Coverage 94% · Recall\nStore 42");
  });
});

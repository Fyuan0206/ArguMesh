import { describe, expect, it } from "vitest";
import { splitPageIntoBlocks } from "../../src/pdf/blocks";

/** 去掉所有空白后比较:这是"一个字都没丢"的最强形式,硬切(无空格输入)下也成立。 */
const squash = (value: string) => value.replace(/\s+/g, "");
/** 归一化空白后比较:对正常散文(块间有空格)必须逐字节相等。 */
const flatten = (value: string) => value.replace(/\s+/g, " ").trim();

function prose(sentences: number, sentenceLength = 90): string {
  return Array.from({ length: sentences }, (_, index) => `Sentence ${index} ${"x".repeat(sentenceLength)}.`).join(" ");
}

describe("splitPageIntoBlocks", () => {
  it("keeps every character (lossless join)", () => {
    const text = prose(60);
    const blocks = splitPageIntoBlocks(text, 400);
    expect(squash(blocks.join(" "))).toBe(squash(text));
  });

  it("reproduces prose byte-for-byte after whitespace normalization", () => {
    // 正常散文里每次切割后都跟一个空格,所以 join(" ") 必须和原文一模一样,
    // 不只是"没丢字" —— 多一个少一个空格都会让缓存校验对不上。
    const text = prose(60);
    expect(flatten(splitPageIntoBlocks(text, 400).join(" "))).toBe(flatten(text));
  });

  it("never splits inside a decimal or an abbreviation", () => {
    // `92.4%` / `Sec. 4.2` / `e.g.` 里的点后跟的不是空白,不算句尾 —— 早期正则版就是
    // 在这里把半个数字吞掉的。这段文本除了小数点没有任何句尾标点,切割只能落在空格上:
    // 若某块以 "." 结尾,说明我们把它当成了句子边界。
    const text = `The model scores 92.4% on Sec. 4.2, e.g. ${"y".repeat(600)}`;
    const blocks = splitPageIntoBlocks(text, 400);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => !block.endsWith(".") && !block.endsWith(";"))).toBe(true);
    expect(blocks.join(" ")).toContain("92.4%");
    expect(blocks.join(" ")).toContain("Sec. 4.2");
    expect(blocks.join(" ")).toContain("e.g.");
    expect(squash(blocks.join(" "))).toBe(squash(text));
  });

  it("returns an empty array for empty or whitespace-only input", () => {
    expect(splitPageIntoBlocks("")).toEqual([]);
    expect(splitPageIntoBlocks("   \n\t ")).toEqual([]);
  });

  it("returns a single block when the text fits one window", () => {
    const text = "Short sentence. Another one.";
    expect(splitPageIntoBlocks(text, 400)).toEqual([text]);
  });

  it("hard-cuts deterministically when there is no punctuation or space at all", () => {
    const text = "z".repeat(1_000);
    const blocks = splitPageIntoBlocks(text, 400);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.length <= 460)).toBe(true);
    expect(squash(blocks.join(" "))).toBe(text);
  });

  it("is deterministic: the same input yields the same split", () => {
    // 块内容会当 IndexedDB 缓存的校验值,切法不稳定就会反复 miss、反复花钱。
    const text = prose(40);
    expect(splitPageIntoBlocks(text, 400)).toEqual(splitPageIntoBlocks(text, 400));
  });

  it("treats CJK punctuation as a boundary without requiring a trailing space", () => {
    // 中文没有词间空格:`。` 后直接跟下一个字。若要求句尾后必须有空白,中文永远切不动。
    const text = `${"内".repeat(200)}。${"容".repeat(200)}。${"结".repeat(200)}。`;
    const blocks = splitPageIntoBlocks(text, 400);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.length <= 460)).toBe(true);
    expect(squash(blocks.join(" "))).toBe(squash(text));
  });

  it("packs a realistic page into blocks near the target length", () => {
    // 实测口径:一页约 6400 字符的英文论文 → 16 块左右,块长 380–425,远低于 8000 上限。
    const text = prose(72);
    const blocks = splitPageIntoBlocks(text, 400);
    expect(blocks.length).toBeGreaterThan(10);
    const lengths = blocks.map((block) => block.length);
    expect(Math.min(...lengths)).toBeGreaterThan(150);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(460);
    expect(squash(blocks.join(" "))).toBe(squash(text));
  });
});

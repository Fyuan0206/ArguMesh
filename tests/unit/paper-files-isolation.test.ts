import { describe, expect, it } from "vitest";
import { accountPaperStorageKey, pageTranslationStorageKey } from "../../src/storage/paperFiles";

describe("local PDF account isolation", () => {
  it("uses different IndexedDB keys for the same paper in different accounts", () => {
    expect(accountPaperStorageKey("chen-fuyuan", "shared-paper-id"))
      .not.toBe(accountPaperStorageKey("luo-murong", "shared-paper-id"));
  });
});

describe("page translation cache keys", () => {
  it("separates account, page and target language", () => {
    const base = pageTranslationStorageKey("chen-fuyuan", "paper-1", 3, "中文");
    expect(pageTranslationStorageKey("luo-murong", "paper-1", 3, "中文")).not.toBe(base);
    expect(pageTranslationStorageKey("chen-fuyuan", "paper-2", 3, "中文")).not.toBe(base);
    // 同一页的英文/中文译文必须分开存,否则来回切语言会拿到另一种语言的缓存。
    expect(pageTranslationStorageKey("chen-fuyuan", "paper-1", 3, "English")).not.toBe(base);
    expect(pageTranslationStorageKey("chen-fuyuan", "paper-1", 4, "中文")).not.toBe(base);
    expect(base).toBe("chen-fuyuan:paper-1:3:中文");
  });
});

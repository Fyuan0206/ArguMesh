import { describe, expect, it } from "vitest";
import { accountPaperStorageKey } from "../../src/storage/paperFiles";

describe("local PDF account isolation", () => {
  it("uses different IndexedDB keys for the same paper in different accounts", () => {
    expect(accountPaperStorageKey("chen-fuyuan", "shared-paper-id"))
      .not.toBe(accountPaperStorageKey("luo-murong", "shared-paper-id"));
  });
});

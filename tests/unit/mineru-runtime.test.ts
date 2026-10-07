// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { join, resolve } from "node:path";
import { mineruDataDirectory, parseMineruProgress, resolveMineruRuntime } from "../../server/services/mineru-runtime";

afterEach(() => vi.unstubAllEnvs());

describe("portable parser boundaries", () => {
  it("stores models in writable user data rather than installation resources", () => {
    vi.stubEnv("ARGUMESH_DATA_DIR", resolve("tests", "user-data"));
    expect(mineruDataDirectory()).toBe(resolve("tests", "user-data", "data"));
  });

  it("never falls back to developer PATH for a broken desktop installation", () => {
    vi.stubEnv("ARGUMESH_DESKTOP", "1");
    vi.stubEnv("ARGUMESH_MINERU_RUNTIME", join(resolve("tests"), "missing-runtime"));
    expect(() => resolveMineruRuntime()).toThrow("安装包中的解析环境不完整");
  });

  it("accepts only bounded progress messages, never raw dependency or document output", () => {
    expect(parseMineruProgress('ARGUMESH_MINERU={"stage":"downloading","completed":2,"total":7}')).toEqual({ stage: "downloading", completed: 2, total: 7 });
    for (const line of ["paper content", "ARGUMESH_MINERU=broken", 'ARGUMESH_MINERU={"stage":"downloading","completed":8,"total":7}', 'ARGUMESH_MINERU={"stage":"downloading","completed":2,"total":100}', 'ARGUMESH_MINERU={"stage":"execute","completed":0,"total":7}']) {
      expect(parseMineruProgress(line)).toBeNull();
    }
  });
});

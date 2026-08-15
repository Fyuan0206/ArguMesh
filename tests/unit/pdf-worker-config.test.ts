import { GlobalWorkerOptions } from "pdfjs-dist";
import { beforeAll, describe, expect, it } from "vitest";

describe("PDF.js shared worker configuration", () => {
  beforeAll(async () => {
    GlobalWorkerOptions.workerSrc = "";
    await import("../../src/pdf/document");
  });

  it("configures a bundled worker before library uploads inspect PDFs", () => {
    expect(GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min.*\.mjs(?:$|\?)/);
  });
});

import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { getPaperPageTexts, savePaperPageText } from "../storage/paperFiles";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export interface PdfMetadata {
  title: string;
  authors: string;
  pageCount: number;
  outline: Array<{ title: string; page: number }>;
}

export interface PdfTextPage {
  page: number;
  text: string;
  source: "native" | "ocr";
}

async function openPdf(blob: Blob) {
  return getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
}

async function pageText(page: PDFPageProxy) {
  const content = await page.getTextContent();
  return content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
}

async function outlineItems(document: PDFDocumentProxy) {
  const outline = await document.getOutline();
  if (!outline) return [];
  const flattened: Array<{ title: string; page: number }> = [];
  const visit = async (items: typeof outline) => {
    for (const item of items) {
      try {
        const destination = typeof item.dest === "string" ? await document.getDestination(item.dest) : item.dest;
        const reference = destination?.[0];
        const pageIndex = typeof reference === "object" && reference ? await document.getPageIndex(reference) : Number(reference ?? 0);
        flattened.push({ title: item.title, page: pageIndex + 1 });
      } catch {
        // Keep usable entries when a PDF contains one broken outline destination.
      }
      if (item.items.length) await visit(item.items);
    }
  };
  await visit(outline);
  return flattened;
}

export async function inspectPdf(blob: Blob): Promise<PdfMetadata> {
  const document = await openPdf(blob);
  try {
    const metadata = await document.getMetadata().catch(() => null);
    const info = metadata?.info as Record<string, unknown> | undefined;
    return {
      title: typeof info?.Title === "string" ? info.Title.trim() : "",
      authors: typeof info?.Author === "string" ? info.Author.trim() : "",
      pageCount: document.numPages,
      outline: await outlineItems(document),
    };
  } finally {
    await document.destroy();
  }
}

export async function extractPdfText(blob: Blob, paperId: string, options: { maxPages?: number; maxChars?: number } = {}): Promise<PdfTextPage[]> {
  const document = await openPdf(blob);
  const storedOcr = await getPaperPageTexts(paperId);
  const maxPages = Math.min(document.numPages, options.maxPages ?? 80);
  const maxChars = options.maxChars ?? 100_000;
  const pages: PdfTextPage[] = [];
  let used = 0;
  try {
    for (let number = 1; number <= maxPages && used < maxChars; number += 1) {
      const page = await document.getPage(number);
      const native = await pageText(page);
      const ocr = storedOcr[number]?.trim() ?? "";
      const selected = native.length >= 40 ? native : ocr || native;
      if (!selected) continue;
      const text = selected.slice(0, Math.min(6_000, maxChars - used));
      pages.push({ page: number, text, source: native.length >= 40 ? "native" : "ocr" });
      used += text.length;
    }
    return pages;
  } finally {
    await document.destroy();
  }
}

export async function recognizePdfPage(page: PDFPageProxy, paperId: string, onProgress?: (progress: number) => void) {
  const viewport = page.getViewport({ scale: 2 });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法创建 OCR 画布");
  await page.render({ canvasContext: context, viewport }).promise;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (message) => {
      if (message.status === "recognizing text" && typeof message.progress === "number") onProgress?.(message.progress);
    },
  });
  try {
    const result = await worker.recognize(canvas);
    const text = result.data.text.replace(/\s+/g, " ").trim();
    if (!text) throw new Error("本页没有识别出文字");
    await savePaperPageText(paperId, page.pageNumber, text);
    return text;
  } finally {
    await worker.terminate();
  }
}

export async function sha256File(file: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

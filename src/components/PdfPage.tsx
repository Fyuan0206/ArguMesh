import { useEffect, useRef } from "react";
import { TextLayer, type PDFPageProxy } from "pdfjs-dist";
import { normalizeRectsToPage, type PageRect } from "../pdf/selection";

/** 选区回调载荷:纯文本 + 气泡锚点(视口坐标)+ 可复绘的页面单位矩形。 */
export interface SelectionPayload {
  text: string;
  clientRect: { top: number; left: number; bottom: number; right: number } | null;
  rects: PageRect[];
}

/** 一条锚定在原文上的批注/高亮(rects 为 PDF 页面单位,与缩放无关)。 */
export interface PdfHighlight {
  id: string;
  rects: PageRect[];
  note: string;
  kind: "note" | "evidence" | "highlight";
}

interface PdfPageProps {
  page: PDFPageProxy;
  scale: number;
  onSelect: (selection: SelectionPayload) => void;
  highlights?: PdfHighlight[];
  onHighlightClick?: (id: string) => void;
}

export function PdfPage({ page, scale, onSelect, highlights = [], onHighlightClick }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const textContainer = textLayerRef.current;
    if (!canvas || !textContainer) return;

    const viewport = page.getViewport({ scale });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d");
    if (!context) return;

    canvas.width = Math.floor(viewport.width * pixelRatio);
    canvas.height = Math.floor(viewport.height * pixelRatio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;
    textContainer.replaceChildren();
    textContainer.style.width = `${Math.floor(viewport.width)}px`;
    textContainer.style.height = `${Math.floor(viewport.height)}px`;
    textContainer.style.setProperty("--scale-factor", String(scale));

    const renderTask = page.render({
      canvasContext: context,
      viewport,
      transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
    });
    const textLayer = new TextLayer({
      textContentSource: page.streamTextContent(),
      container: textContainer,
      viewport,
    });
    void renderTask.promise.catch((error: unknown) => {
      if (error instanceof Error && error.name !== "RenderingCancelledException") throw error;
    });
    void textLayer.render().catch((error: unknown) => {
      if (error instanceof Error && error.name !== "AbortException") throw error;
    });

    return () => {
      renderTask.cancel();
      textLayer.cancel();
    };
  }, [page, scale]);

  function captureSelection() {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    // 只响应 textLayer 内的选区:页面其它区域(侧栏/工具栏)的选中不应影响气泡。
    if (!anchorNode || !textLayerRef.current?.contains(anchorNode)) return;
    const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
    if (!text) {
      // 在原文区单击(无选区)→ 通知上层收起气泡。
      onSelect({ text: "", clientRect: null, rects: [] });
      return;
    }
    let clientRect: SelectionPayload["clientRect"] = null;
    let rects: PageRect[] = [];
    const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    if (range) {
      const bounds = range.getBoundingClientRect();
      clientRect = {
        top: bounds.top,
        left: bounds.left,
        bottom: bounds.bottom,
        right: bounds.right,
      };
      const container = textLayerRef.current?.getBoundingClientRect();
      if (container) {
        // 视口坐标 → PDF 页面单位:减容器原点、除 scale,得到与缩放无关的几何。
        // getClientRects() 返回 DOMRectList(array-like),先转数组;一行一个矩形。
        rects = normalizeRectsToPage(Array.from(range.getClientRects()), container, scale);
      }
    }
    onSelect({ text, clientRect, rects });
  }

  const viewport = page.getViewport({ scale });
  return (
    <div
      className="pdf-page"
      style={{ width: viewport.width, height: viewport.height }}
      onMouseUp={captureSelection}
      onKeyUp={captureSelection}
    >
      <canvas ref={canvasRef} aria-label={`PDF 第 ${page.pageNumber} 页`} />
      <div ref={textLayerRef} className="textLayer" />
      <div className="highlight-layer">
        {highlights.map((highlight) =>
          highlight.rects.map((rect, index) => (
            <div
              key={`${highlight.id}-${index}`}
              className={`mark mark-${highlight.kind}`}
              style={{
                left: rect.left * scale,
                top: rect.top * scale,
                width: rect.width * scale,
                height: rect.height * scale,
              }}
              title={highlight.note || undefined}
              onClick={() => onHighlightClick?.(highlight.id)}
            />
          )),
        )}
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import { TextLayer, type PDFPageProxy } from "pdfjs-dist";

interface PdfPageProps {
  page: PDFPageProxy;
  scale: number;
  onSelect: (text: string) => void;
}

export function PdfPage({ page, scale, onSelect }: PdfPageProps) {
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
    const text = selection?.toString().replace(/\s+/g, " ").trim() ?? "";
    const anchorNode = selection?.anchorNode;
    if (text && anchorNode && textLayerRef.current?.contains(anchorNode)) onSelect(text);
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
    </div>
  );
}

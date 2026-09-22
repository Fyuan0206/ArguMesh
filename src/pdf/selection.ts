// 划词高亮/气泡定位的纯几何换算。不依赖 pdfjs / DOM,可单测。
//
// 背景:pdfjs 的 TextLayer 容器 CSS 尺寸恒为 `viewport.width × viewport.height`
// (见 components/PdfPage.tsx),文字 span 用 `transform: scale(var(--scale-factor))`
// 按当前 scale 摆放。因此把选区在视口里的 client 矩形减去容器原点、再除以 scale,
// 得到与缩放无关的"PDF 页面单位"矩形;重绘时乘回当前 scale 即可随缩放正确定位。

export interface PageRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 容器左上角在视口中的坐标。 */
export interface Point {
  left: number;
  top: number;
}

/** 视口坐标下的矩形(DOMRect / Range.getBoundingClientRect 的形状)。 */
export interface ClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 把一组视口 client 矩形换算成 PDF 页面单位矩形(相对 textLayer 容器左上角)。
 * 过滤掉宽或高 < 0.5px 的退化矩形(换行处产生的零高/零宽框)。
 * scale 非法(≤0 或非有限)时返回空数组。
 */
export function normalizeRectsToPage(clientRects: ClientRect[], container: Point, scale: number): PageRect[] {
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return clientRects
    .map((rect) => ({
      left: (rect.left - container.left) / scale,
      top: (rect.top - container.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale,
    }))
    .filter((rect) => rect.width >= 0.5 && rect.height >= 0.5);
}

export interface Viewport {
  width: number;
  height: number;
}

export interface BubbleAnchor {
  /** position:fixed 的 top(px)。 */
  top: number;
  /** position:fixed 的 left(px)。 */
  left: number;
  placement: "above" | "below";
}

const BUBBLE_WIDTH = 340;
const BUBBLE_HEIGHT = 40;
const EDGE = 12;

/**
 * 计算悬浮气泡的 fixed 定位:默认在选区上方,上方空间不足则翻到下方;
 * 水平方向以选区中心对齐并 clamp 在视口内。
 */
export function pickBubbleAnchor(
  clientRect: { top: number; left: number; bottom: number; right: number },
  viewport: Viewport,
  size: { width?: number; height?: number } = {},
): BubbleAnchor {
  const width = size.width ?? BUBBLE_WIDTH;
  const height = size.height ?? BUBBLE_HEIGHT;
  const placeAbove = clientRect.top - height - EDGE >= 0;
  const top = placeAbove ? clientRect.top - height - EDGE : clientRect.bottom + EDGE;
  const centerX = (clientRect.left + clientRect.right) / 2;
  const maxLeft = Math.max(EDGE, viewport.width - width - EDGE);
  const left = Math.min(Math.max(EDGE, centerX - width / 2), maxLeft);
  return { top, left, placement: placeAbove ? "above" : "below" };
}

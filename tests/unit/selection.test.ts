import { describe, expect, it } from "vitest";
import { normalizeRectsToPage, pickBubbleAnchor } from "../../src/pdf/selection";

describe("normalizeRectsToPage", () => {
  const container = { left: 100, top: 50 };

  it("subtracts the container origin and divides by scale", () => {
    const rects = normalizeRectsToPage(
      [{ left: 150, top: 90, width: 60, height: 12 }],
      container,
      2,
    );
    expect(rects).toEqual([{ left: 25, top: 20, width: 30, height: 6 }]);
  });

  it("round-trips the same page rect captured at any scale", () => {
    // 同一段原文的页面单位矩形是固定的;不同 scale 下浏览器给的是 page × scale 的视口矩形,
    // 各自除回自己的 scale 必须得到同一个页面矩形 —— 这是高亮能跟着缩放不飘移的依据。
    const page = { left: 40, top: 30, width: 40, height: 10 };
    const atOne = normalizeRectsToPage(
      [{ left: container.left + page.left, top: container.top + page.top, width: page.width, height: page.height }],
      container,
      1,
    )[0];
    const atTwo = normalizeRectsToPage(
      [{ left: container.left + page.left * 2, top: container.top + page.top * 2, width: page.width * 2, height: page.height * 2 }],
      container,
      2,
    )[0];
    expect(atOne).toEqual(page);
    expect(atTwo).toEqual(page);
  });

  it("drops degenerate rects produced by line breaks", () => {
    const rects = normalizeRectsToPage(
      [
        { left: 110, top: 60, width: 30, height: 10 },
        { left: 110, top: 70, width: 30, height: 0 },
        { left: 110, top: 80, width: 0.2, height: 10 },
      ],
      container,
      1,
    );
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ left: 10, top: 10, width: 30, height: 10 });
  });

  it("keeps one rect per selected line", () => {
    const rects = normalizeRectsToPage(
      [
        { left: 110, top: 60, width: 200, height: 10 },
        { left: 110, top: 74, width: 180, height: 10 },
        { left: 110, top: 88, width: 90, height: 10 },
      ],
      container,
      1,
    );
    expect(rects.map((rect) => rect.top)).toEqual([10, 24, 38]);
  });

  it("returns nothing for an invalid scale", () => {
    expect(normalizeRectsToPage([{ left: 1, top: 1, width: 5, height: 5 }], container, 0)).toEqual([]);
    expect(normalizeRectsToPage([{ left: 1, top: 1, width: 5, height: 5 }], container, Number.NaN)).toEqual([]);
  });
});

describe("pickBubbleAnchor", () => {
  const viewport = { width: 1000, height: 700 };

  it("places the bubble above the selection when there is room", () => {
    const anchor = pickBubbleAnchor({ top: 300, bottom: 316, left: 400, right: 600 }, viewport);
    expect(anchor.placement).toBe("above");
    expect(anchor.top).toBe(300 - 40 - 12);
    expect(anchor.left).toBe(500 - 170);
  });

  it("flips below when the selection sits near the top edge", () => {
    const anchor = pickBubbleAnchor({ top: 20, bottom: 36, left: 400, right: 600 }, viewport);
    expect(anchor.placement).toBe("below");
    expect(anchor.top).toBe(36 + 12);
  });

  it("clamps horizontally inside the viewport", () => {
    const left = pickBubbleAnchor({ top: 300, bottom: 316, left: 2, right: 10 }, viewport);
    expect(left.left).toBe(12);
    const right = pickBubbleAnchor({ top: 300, bottom: 316, left: 990, right: 998 }, viewport);
    expect(right.left).toBe(1000 - 340 - 12);
  });

  it("honours a custom bubble size", () => {
    const anchor = pickBubbleAnchor(
      { top: 300, bottom: 316, left: 0, right: 0 },
      viewport,
      { width: 300, height: 60 },
    );
    expect(anchor.top).toBe(300 - 60 - 12);
    expect(anchor.left).toBe(12);
  });
});

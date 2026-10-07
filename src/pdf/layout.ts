/** Restore the reading structure that PDF.js exposes through text positions and line endings. */
export interface LayoutTextItem {
  str: string;
  hasEOL: boolean;
  transform: number[];
  width: number;
  fontName?: string;
}

export interface PageLayoutBlock {
  text: string;
  kind: "heading" | "paragraph";
  column: "full" | 0 | 1;
  leadIn: boolean;
}

export interface PageLayout {
  columns: 1 | 2;
  blocks: PageLayoutBlock[];
}

interface Line {
  text: string;
  x: number;
  endX: number;
  y: number;
  height: number;
  firstFont?: string;
  leadIn: boolean;
}

function linesFromItems(items: readonly LayoutTextItem[]): Line[] {
  const lines: Line[] = [];
  let line: Line | null = null;
  const flush = () => {
    if (line?.text.trim()) lines.push({ ...line, text: line.text.replace(/\s+/g, " ").trim() });
    line = null;
  };

  for (const item of items) {
    const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = item.transform;
    // Marginalia and vertical watermarks are not part of the paper's reading order.
    if (Math.abs(b) > Math.abs(a) || Math.abs(c) > Math.abs(d)) continue;
    const height = Math.max(1, Math.hypot(c, d));
    if (line && Math.abs(line.y - y) > Math.max(2, height * .3)) flush();
    if (item.str) {
      if (!line) {
        line = { text: "", x, endX: x, y, height, leadIn: false };
      }
      if (item.str.trim()) {
        if (!line.firstFont) line.firstFont = item.fontName;
        else if (item.fontName && item.fontName !== line.firstFont && /^[^.]{2,90}\.\s*$/.test(line.text)) line.leadIn = true;
      }
      if (line.text && !/\s$/.test(line.text) && !/^\s/.test(item.str) && x - line.endX > Math.max(1.5, height * .2)) line.text += " ";
      line.text += item.str;
      line.endX = Math.max(line.endX, x + item.width);
      line.height = Math.max(line.height, height);
    }
    if (item.hasEOL) flush();
  }
  flush();
  return lines;
}

function isHeading(text: string, lineCount: number, height: number, bodyHeight: number): boolean {
  if (text.length > 120) return false;
  if (height > bodyHeight * 1.14 && lineCount <= 3) return true;
  if (lineCount !== 1) return false;
  if (/^\d+(?:\.\d+)*\s+\S/.test(text)) return true;
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase() && text.length < 70;
}

/** PDF.js text items retain geometry even when a flat page string has lost paragraphs. */
export function layoutTextItems(items: readonly LayoutTextItem[], pageWidth: number, pageHeight = pageWidth * 1.3): PageLayout {
  const lines = linesFromItems(items).filter((line) => {
    const isFooterNumber = /^\d{1,4}$/.test(line.text) && line.y < pageHeight * .1
      && Math.abs((line.x + line.endX) / 2 - pageWidth / 2) < pageWidth * .1;
    return !isFooterNumber;
  });
  if (!lines.length) return { columns: 1, blocks: [] };
  const leftCount = lines.filter((line) => line.x < pageWidth * .34).length;
  const rightCount = lines.filter((line) => line.x > pageWidth * .47 && line.endX < pageWidth * .98).length;
  const minimumColumnLines = Math.max(4, Math.ceil(lines.length * .18));
  const columns: 1 | 2 = leftCount >= minimumColumnLines && rightCount >= minimumColumnLines ? 2 : 1;
  const bodyHeights = lines.map((line) => line.height).sort((a, b) => a - b);
  const bodyHeight = bodyHeights[Math.floor(bodyHeights.length / 2)];
  const topRightY = Math.max(...lines.filter((line) => line.x > pageWidth * .47).map((line) => line.y));
  const columnFor = (line: Line): "full" | 0 | 1 => {
    if (columns === 1) return 0;
    if (line.y > topRightY + bodyHeight && line.x < pageWidth * .3 && line.endX > pageWidth * .6) return "full";
    return line.x > pageWidth * .47 ? 1 : 0;
  };

  const grouped: Array<{ lines: Line[]; column: "full" | 0 | 1 }> = [];
  const groupColumn = (columnLines: Line[], column: "full" | 0 | 1) => {
    for (const current of columnLines) {
      const previous = grouped.at(-1);
      const lastLine = previous?.column === column ? previous.lines.at(-1) : undefined;
      const gap = lastLine ? lastLine.y - current.y : 0;
      const newParagraph = !lastLine || gap < 0 || gap > Math.max(lastLine.height, current.height) * 1.4;
      if (newParagraph) grouped.push({ lines: [current], column });
      else previous!.lines.push(current);
    }
  };
  if (columns === 1) groupColumn(lines, 0);
  else for (const column of ["full", 0, 1] as const) {
    groupColumn(lines.filter((line) => columnFor(line) === column).sort((a, b) => b.y - a.y), column);
  }

  const blocks = grouped.map(({ lines: paragraph, column }) => {
    const text = paragraph.map((line) => line.text).join(" ");
    return { text, kind: isHeading(text, paragraph.length, paragraph[0].height, bodyHeight) ? "heading" as const : "paragraph" as const, column, leadIn: paragraph[0].leadIn };
  });
  return { columns, blocks };
}

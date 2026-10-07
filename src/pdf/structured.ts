/** Extract table cells as text only. MinerU's PDF-derived HTML is never injected into the page. */
export interface StructuredTableCell {
  text: string;
  rowSpan: number;
  colSpan: number;
}

export function parseStructuredTable(html: string): StructuredTableCell[][] {
  if (!html || html.length > 60_000) return [];
  const table = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if (!table || /<table\b/i.test(table)) return [];
  const decode = (text: string) => text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#(?:x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower[0] === "#") {
        const point = lower[1] === "x" ? Number.parseInt(lower.slice(2), 16) : Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
      }
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[lower] ?? "";
    }).replace(/\s+/g, " ").trim().slice(0, 500);
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 100);
  return rows.map(([, row]) => [...row.matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].slice(0, 20)
    .map(([, , attributes, content]) => {
      const span = (name: string, max: number) => Math.max(1, Math.min(max, Number(new RegExp(`\\b${name}\\s*=\\s*["']?(\\d+)`, "i").exec(attributes)?.[1]) || 1));
      return { text: decode(content), rowSpan: span("rowspan", 100), colSpan: span("colspan", 20) };
    })).filter((row) => row.length);
}

/** Measurements, formulas, and model identifiers are source data, not prose for an LLM to rewrite. */
export function shouldTranslateTableCell(text: string): boolean {
  if (!/[A-Za-z\u4e00-\u9fff]/.test(text)) return false;
  if (/^GPT[-\s]?\d/i.test(text)) return false;
  if (/^[a-z]{1,12}(?:\+[a-z]{1,12})+$/i.test(text)) return false;
  if (/^[A-Z0-9.+-]+$/.test(text)) return false;
  return true;
}

/** Translate prose in a table while restoring every numeric value from the source verbatim. */
export function lockTableNumbers(source: string): { masked: string; restore: (translated: string) => string | null } {
  const values: string[] = [];
  const token = (index: number) => {
    let letters = "";
    for (let value = index + 1; value > 0; value = Math.floor((value - 1) / 26)) letters = String.fromCharCode(65 + (value - 1) % 26) + letters;
    return `__AMVALUE${letters}__`;
  };
  const masked = source.replace(/\d+(?:[.,]\d+)*(?:%)?/g, (value) => {
    const index = values.push(value) - 1;
    return token(index);
  });
  return {
    masked,
    restore: (translated) => {
      let result = translated;
      for (const [index, value] of values.entries()) {
        const placeholder = token(index);
        if (!result.includes(placeholder)) return null;
        result = result.replace(placeholder, value);
      }
      return preservesTableNumbers(source, result) ? result : null;
    },
  };
}

export function preservesTableNumbers(source: string, translation: string): boolean {
  const numbers = (text: string) => text.match(/\d+(?:[.,]\d+)*(?:%)?/g) ?? [];
  return JSON.stringify(numbers(source)) === JSON.stringify(numbers(translation));
}

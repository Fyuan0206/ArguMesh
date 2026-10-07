/** Keep readable figure labels from Tesseract TSV without treating drawing strokes as words. */
export function readableFigureText(tsv: string | null): string {
  if (!tsv) return "";
  const lines = new Map<string, Array<{ text: string; left: number; right: number; height: number }>>();
  for (const row of tsv.split(/\r?\n/)) {
    const cells = row.split("\t");
    if (cells.length < 12 || cells[0] !== "5") continue;
    const confidence = Number(cells[10]);
    const word = cells.slice(11).join("\t").trim();
    if (confidence < 75 || !/[A-Za-z]{2,}/.test(word) && !/\d/.test(word) && !/^[“"]?(?:I|I'm|a)[”"]?$/.test(word)) continue;
    const key = cells.slice(1, 5).join(":");
    const left = Number(cells[6]);
    const width = Number(cells[8]);
    const height = Number(cells[9]);
    const words = lines.get(key) ?? [];
    words.push({ text: word, left, right: left + width, height });
    lines.set(key, words);
  }
  return Array.from(lines.values(), (words) => {
    if (!words.some((word) => /[A-Za-z]{2,}/.test(word.text))) return "";
    let result = "";
    for (const [index, word] of words.entries()) {
      const previous = words[index - 1];
      const gap = previous ? word.left - previous.right : 0;
      result += `${previous ? gap > 3 * Math.max(word.height, previous.height) ? " · " : " " : ""}${word.text}`;
    }
    return result;
  }).filter(Boolean).join("\n").slice(0, 2_000);
}

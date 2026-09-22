// 把一页 PDF 文本切成适合"逐段翻译"的块。纯函数:不依赖 pdfjs / DOM / 网络,可单测。
//
// 为什么需要它:`document.ts` 的 `pageText()` 把整页压成一条扁平字符串,没有段落结构;
// 而 `/api/reader/translate` 是按段打的请求、单次上限 8000 字符。切块有两条硬约束:
//   1. **无损** —— 块拼回来必须与原文等价,否则就是静默丢字。
//   2. **确定** —— 同样输入永远切出同样的块,因为块内容会当 IndexedDB 缓存的校验值。
//
// ⚠️ 踩过的坑(别再改回正则):最初用 `text.match(/[^.!?]+[.!?]+\s+|…/g)` 找句子。该分支
// 要求句尾后必须有空白,遇到 `92.4` 时匹配失败,正则引擎向前挪一位重试 —— 被跳过的字符
// 直接消失,426 字符的样本只匹配出 83 字符,而 `String.match` 不报错,只会少给。
// 所以这里用"窗口内向前回溯找边界",按构造无损,并用单测把无损性钉死。

/** 句尾后必须跟空白(或结尾)才算边界:`92.4` / `Sec. 4.2` / `e.g.` 里的点因此天然安全。 */
const ASCII_ENDERS = new Set([".", "!", "?", ";"]);
/** 中文标点自身就是边界,不要求后跟空白 —— 否则无空格的中文文本永远找不到边界。 */
const CJK_ENDERS = new Set(["。", "！", "？", "；"]);

/** 窗口比目标长度宽出这么多,给"向前找最后一个句子边界"留余地。 */
const WINDOW_SLACK = 60;

function isSentenceEnd(text: string, index: number): boolean {
  const char = text[index];
  if (CJK_ENDERS.has(char)) return true;
  if (!ASCII_ENDERS.has(char)) return false;
  return index + 1 >= text.length || /\s/.test(text[index + 1]);
}

/** 归一化空白:PDF 抽出的文本常带连续空格/换行,先压成单空格,块边界才好算。 */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 把一页扁平文本切成翻译块。返回值满足:
 * - 无损:`blocks.join(" ")` 归一化空白后与入参归一化空白后一致(无空格输入时至少不丢字)。
 * - 确定:同输入必得同输出。
 * - 长度大致贴近 `targetChars`:先在 `targetChars + WINDOW_SLACK` 窗口内向前找最后一个
 *   句子边界,找不到退到最后一个空格,再不行按窗口硬切。块长不会超过 `targetChars + WINDOW_SLACK`。
 *
 * 空输入 / 纯空白 → `[]`;短于一个窗口的文本 → 单个块。
 */
export function splitPageIntoBlocks(text: string, targetChars = 400): string[] {
  const normalized = normalizeWhitespace(typeof text === "string" ? text : "");
  if (!normalized) return [];

  const limit = normalized.length;
  const window = Math.max(1, targetChars) + WINDOW_SLACK;
  // 块太短就没意义了(一个标题一块)。找不到足够长的边界时才允许更短。
  const minChars = Math.max(1, Math.floor(Math.max(1, targetChars) / 2));
  const blocks: string[] = [];
  let cursor = 0;

  while (cursor < limit) {
    if (limit - cursor <= window) {
      blocks.push(normalized.slice(cursor));
      break;
    }
    const windowEnd = cursor + window;
    let cut = -1;
    for (let index = windowEnd - 1; index >= cursor + minChars; index -= 1) {
      if (isSentenceEnd(normalized, index)) { cut = index + 1; break; }
    }
    if (cut < 0) {
      for (let index = windowEnd - 1; index >= cursor + minChars; index -= 1) {
        if (normalized[index] === " ") { cut = index; break; }
      }
    }
    if (cut < 0) cut = windowEnd;
    blocks.push(normalized.slice(cursor, cut));
    // 归一化后块间只可能有一个空格;跳过它,拼回时用 " " 补上。
    cursor = normalized[cut] === " " ? cut + 1 : cut;
  }

  return blocks;
}

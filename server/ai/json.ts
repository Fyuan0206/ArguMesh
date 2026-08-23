/**
 * AI 输出解析工具（单一真源，取代 route 内重复的 parseJson* 定义）。
 * 从 LLM 文本里抠出结构化 JSON，容忍 ```json 围栏与 ``` 思考块。
 */

/** 移除 </think> 思考块（及其中的前后缀），保留正文。 */
export function stripThinkBlock(content: string): string {
  const cleaned = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return cleaned || content;
}

/**
 * 从 LLM 输出里抠出第一个 JSON 对象（容忍 ```json 围栏与前后杂絮）。
 * 多处 route 原本各自复制此函数，现收敛为本文件单一实现。
 */
export function parseJsonObject(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI response did not contain a JSON object");
  return JSON.parse(fenced.slice(start, end + 1));
}

/**
 * 从 LLM 输出里抠出第一个 JSON 数组（容忍围栏与 <think> 思考块残留）。
 * extraction.ts 的矩阵证据抽取专用。
 */
export function parseJsonArray(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? content;
  const start = fenced.indexOf("[");
  const end = fenced.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("AI response did not contain a JSON array");
  return JSON.parse(fenced.slice(start, end + 1));
}

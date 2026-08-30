import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Render Research Agent replies as GFM markdown (tables, lists, headings). */
export function AgentMarkdown({ content }: { content: string }) {
  return (
    <div className="agent-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

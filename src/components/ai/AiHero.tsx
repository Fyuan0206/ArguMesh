import { ArrowRight, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";

/** Project-home entry into the shared Research Agent task panel. */
export function AiHero() {
  function openAi(prefill: string) {
    window.dispatchEvent(new CustomEvent("paperidea:open-ai", { detail: { prefill } }));
  }

  return (
    <section className="ai-hero" aria-labelledby="ai-hero-title">
      <span className="eyebrow"><Sparkle weight="fill" /> AI 研究助手</span>
      <h1 id="ai-hero-title">你正在研究什么？</h1>
      <p className="ai-hero-sub">输入研究方向，AI 帮你分析论文、提炼知识、发现缺口、生成 Idea。</p>
      <form
        className="ai-hero-form"
        onSubmit={(event) => {
          event.preventDefault();
          const direction = String(new FormData(event.currentTarget).get("direction") ?? "").trim();
          openAi(direction || "帮我分析这个研究方向");
        }}
      >
        <label className="ai-hero-field">
          <span className="visually-hidden">研究方向</span>
          <MagnifyingGlass />
          <input name="direction" placeholder="问 Research Agent，或输入你的研究方向…" />
        </label>
        <button type="submit" className="primary">开始研究 <ArrowRight /></button>
      </form>
    </section>
  );
}

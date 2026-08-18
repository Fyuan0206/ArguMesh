import {
  ArrowDown,
  ArrowRight,
  BookOpenText,
  FilePdf,
  GridFour,
  Lightbulb,
  SignIn,
  X,
} from "@phosphor-icons/react";
import { useId, useState, type FormEvent } from "react";
import { AccessGate } from "../components/AccessGate";

const PENDING_QUESTION_KEY = "argumesh_pending_project_question";

/** 落地页配图:WebP 优先 + PNG 回退。`lazy` 关闭 + `priority` 仅用于首屏 LCP 图,其余懒加载。 */
function LandingShot({ base, alt, lazy = true, priority = false }: { base: string; alt: string; lazy?: boolean; priority?: boolean }) {
  return (
    <picture>
      <source srcSet={`/${base}.webp`} type="image/webp" />
      <img
        src={`/${base}.png`}
        alt={alt}
        loading={lazy ? "lazy" : "eager"}
        decoding={priority ? "sync" : "async"}
        {...(priority ? { fetchPriority: "high" as const } : {})}
      />
    </picture>
  );
}

const STARTER_QUESTIONS = [
  "不同遮挡建模方法如何影响人体姿态估计性能？",
  "多模态大模型的事实一致性如何被可靠评估？",
  "哪些训练策略能提升小样本医学影像分类？",
];

export function LandingPage() {
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const questionId = useId();

  function scrollToComposer() {
    document.getElementById("research-start")?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => document.getElementById(questionId)?.focus(), 350);
  }

  function openLogin({ preserveQuestion = false }: { preserveQuestion?: boolean } = {}) {
    if (preserveQuestion && question.trim()) {
      window.sessionStorage.setItem(PENDING_QUESTION_KEY, question.trim());
    }
    setLoginOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim()) {
      setError("先写下一个你想弄清的研究问题。");
      document.getElementById(questionId)?.focus();
      return;
    }
    setError("");
    openLogin({ preserveQuestion: true });
  }

  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <nav className="landing-nav" aria-label="落地页导航">
          <a className="landing-logo" href="#top" aria-label="ArguMesh 论脉首页">
            <img src="/argumesh-logo.svg" alt="ArguMesh 论脉" />
          </a>
          <div className="landing-nav-links">
            <a href="#workflow">产品</a>
            <a href="#research-start">开始研究</a>
          </div>
          <div className="landing-nav-actions">
            <button type="button" className="landing-login" onClick={() => openLogin()}>
              <SignIn /> 登录
            </button>
            <button type="button" className="landing-trial" onClick={scrollToComposer}>开始研究</button>
          </div>
        </nav>

        <div id="top" className="landing-hero-grid">
          <div className="landing-hero-copy">
            <span className="landing-kicker">研究序章 / Research Prologue</span>
            <h1 id="landing-title">
              从一篇论文出发，<br />
              走到一个站得住的研究 <em>Idea.</em>
            </h1>
            <p>论脉是一个以证据为中心的文献研究工作台，帮你阅读、核验、对比证据，从而更有把握地推进研究。</p>
            <div className="landing-hero-actions">
              <button type="button" className="landing-primary" onClick={scrollToComposer}>
                开始一个研究问题 <ArrowRight />
              </button>
              <a href="#workflow"><ArrowDown /> 看看论脉如何工作</a>
            </div>
          </div>
          <div className="landing-product-stage" aria-label="论脉证据矩阵产品预览">
            <LandingShot base="landing-matrix" alt="论脉证据矩阵与原文核验界面" lazy={false} priority />
          </div>
        </div>
      </section>

      <section id="research-start" className="research-composer" aria-labelledby="research-start-title">
        <form onSubmit={submit} noValidate>
          <div className="research-composer-main">
            <span className="landing-kicker">新建研究空间</span>
            <h2 id="research-start-title">先写下你想弄清的问题</h2>
            <p>用一句话开启研究。项目名称、文献范围和比较维度都可以稍后再补。</p>
            <label htmlFor={questionId} className="sr-only">研究问题</label>
            <textarea
              id={questionId}
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                if (error) setError("");
              }}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${questionId}-error` : undefined}
              placeholder="例如：遮挡场景下的关键点检测方法，哪些设计能提升跨数据集的泛化能力？"
              rows={4}
            />
            {error ? <span id={`${questionId}-error`} className="composer-error" role="alert">{error}</span> : null}
            <div className="starter-questions" aria-label="研究问题示例">
              {STARTER_QUESTIONS.map((item) => (
                <button type="button" key={item} onClick={() => { setQuestion(item); setError(""); }}>
                  {item}
                </button>
              ))}
            </div>
            <div className="research-composer-actions">
              <button type="button" className="paper-import-entry" onClick={() => openLogin({ preserveQuestion: true })}>
                <FilePdf /> 已有论文？登录后导入 PDF / DOI
              </button>
              <button type="submit" className="landing-primary">建立研究空间 <ArrowRight /></button>
            </div>
          </div>
          <aside className="research-next-steps" aria-label="后续步骤">
            <strong>接下来我们会帮你</strong>
            <ol>
              <li><span>1</span><div><b>确定文献范围</b><small>导入已有论文或补充检索方向</small></div></li>
              <li><span>2</span><div><b>定义证据维度</b><small>选择需要跨论文核验的关键问题</small></div></li>
            </ol>
            <p>以上步骤均可稍后调整</p>
          </aside>
        </form>
      </section>

      <section id="workflow" className="landing-workflow" aria-labelledby="workflow-title">
        <header>
          <span className="landing-kicker">可信研究工作流</span>
          <h2 id="workflow-title">不是替你下结论，而是让每个结论都有出处</h2>
        </header>
        <article className="landing-feature">
          <div className="landing-feature-index">01</div>
          <div className="landing-feature-copy"><BookOpenText /><h3>阅读原文<br />保留页码与引用</h3><p>原文 PDF 与关键信息并置，所有摘录都带出处与页码，让阅读更快，也更可信。</p></div>
          <div className="landing-feature-image"><LandingShot base="landing-reader" alt="论脉 PDF 阅读器与选区问答界面" /></div>
        </article>
        <article className="landing-feature">
          <div className="landing-feature-index">02</div>
          <div className="landing-feature-copy"><GridFour /><h3>对比证据<br />跨论文核验</h3><p>把关键结论放入证据矩阵，跨论文、跨维度对比核验，找出真正成立的证据。</p></div>
          <div className="landing-feature-image"><LandingShot base="landing-matrix" alt="论脉跨论文证据矩阵界面" /></div>
        </article>
        <article className="landing-feature">
          <div className="landing-feature-index">03</div>
          <div className="landing-feature-copy"><Lightbulb /><h3>推进 Idea<br />从证据形成假设</h3><p>让证据、冲突与研究空白共同推动下一步，研究构想不再是脱离原文的灵感孤岛。</p></div>
          <div className="landing-feature-image"><LandingShot base="landing-workflow" alt="论脉项目研究工作流界面" /></div>
        </article>
      </section>

      <footer className="landing-footer">
        <img src="/argumesh-logo.svg" alt="ArguMesh 论脉" />
        <p>把证据连成研究脉络。</p>
        <button type="button" onClick={scrollToComposer}>开始一个研究问题 <ArrowRight /></button>
      </footer>

      {loginOpen ? (
        <div className="landing-login-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLoginOpen(false); }}>
          <div className="landing-login-dialog" role="dialog" aria-modal="true" aria-label="登录论文工作台">
            <button type="button" className="landing-login-close" onClick={() => setLoginOpen(false)} aria-label="关闭登录"><X /></button>
            <AccessGate embedded />
          </div>
        </div>
      ) : null}
    </main>
  );
}

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Flask, Lightbulb, MagnifyingGlass, NotePencil, Question, Sparkle, Warning, X } from "@phosphor-icons/react";
import { analyzeKnowledge, discoverGaps } from "../../api";
import { useRouteContext } from "../../hooks/useRouteContext";

type PaletteGroup = "insight" | "content";

interface PaletteAction {
  id: string;
  label: string;
  hint: string;
  badge: string;
  group: PaletteGroup;
  icon: React.ReactNode;
  needsProject: boolean;
  run: (ctx: { projectId?: string; navigate: (to: string) => void; close: () => void; setStatus: (status: string) => void }) => void | Promise<void>;
}

const ACTIONS: PaletteAction[] = [
  {
    id: "discover-gap",
    label: "发现研究缺口",
    hint: "识别尚未覆盖的研究问题",
    badge: "需已有知识",
    group: "insight",
    icon: <Question />,
    needsProject: true,
    async run({ projectId, navigate, close, setStatus }) {
      if (!projectId) return;
      setStatus("正在发现研究缺口…");
      try {
        await discoverGaps(projectId);
        navigate(`/projects/${encodeURIComponent(projectId)}/gaps`);
        close();
      } catch (error) {
        setStatus(error instanceof Error ? `失败：${error.message}` : "缺口发现失败，请稍后重试");
      }
    },
  },
  {
    id: "analyze",
    label: "知识情报分析",
    hint: "检查冲突、重复与缺失证据",
    badge: "需已有知识",
    group: "insight",
    icon: <Sparkle />,
    needsProject: true,
    async run({ projectId, navigate, close, setStatus }) {
      if (!projectId) return;
      setStatus("正在分析知识情报…");
      try {
        await analyzeKnowledge(projectId);
        navigate(`/knowledge?project=${encodeURIComponent(projectId)}`);
        close();
      } catch (error) {
        setStatus(error instanceof Error ? `失败：${error.message}` : "情报分析失败，请稍后重试");
      }
    },
  },
  {
    id: "analyze-paper",
    label: "分析论文",
    hint: "生成结构化 Paper Card",
    badge: "需已有文献",
    group: "content",
    icon: <MagnifyingGlass />,
    needsProject: true,
    run({ projectId, navigate, close }) {
      navigate(`/projects/${encodeURIComponent(projectId!)}/library`);
      close();
    },
  },
  {
    id: "extract-knowledge",
    label: "提炼知识",
    hint: "形成笔记、Claim 与证据",
    badge: "需已有文献",
    group: "content",
    icon: <NotePencil />,
    needsProject: true,
    run({ projectId, navigate, close }) {
      navigate(`/projects/${encodeURIComponent(projectId!)}/library`);
      close();
    },
  },
  {
    id: "draft-idea",
    label: "生成 Idea",
    hint: "从证据起草研究画布",
    badge: "需已有证据",
    group: "content",
    icon: <Lightbulb />,
    needsProject: true,
    run({ projectId, navigate, close }) {
      navigate(`/ideas?project=${encodeURIComponent(projectId!)}`);
      close();
    },
  },
  {
    id: "open-experiments",
    label: "查看实验",
    hint: "把 Idea 落到实验方案",
    badge: "需已有 Idea",
    group: "content",
    icon: <Flask />,
    needsProject: true,
    run({ projectId, navigate, close }) {
      navigate(`/projects/${encodeURIComponent(projectId!)}/experiments`);
      close();
    },
  },
];

const GROUPS: Array<{ id: PaletteGroup; label: string }> = [
  { id: "insight", label: "分析洞察" },
  { id: "content", label: "内容生成" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const actionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const openerRef = useRef<HTMLElement | null>(null);
  const navigate = useNavigate();
  const context = useRouteContext();

  useEffect(() => {
    function onOpen() {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setOpen(true);
    }
    window.addEventListener("paperidea:open-ai", onOpen);
    return () => window.removeEventListener("paperidea:open-ai", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    setStatus("");
    setError(false);
    const timer = window.setTimeout(() => actionRefs.current[0]?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  function close() {
    setOpen(false);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }

  function execute(action: PaletteAction) {
    if (action.needsProject && !context.projectId) {
      setError(true);
      return;
    }
    setError(false);
    void action.run({ projectId: context.projectId, navigate, close, setStatus });
  }

  function moveFocus(index: number) {
    const next = (index + ACTIONS.length) % ACTIONS.length;
    setActive(next);
    actionRefs.current[next]?.focus();
  }

  function onActionKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(index + 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(index - 1); }
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.shiftKey
      ? (current <= 0 ? focusable.length - 1 : current - 1)
      : (current === focusable.length - 1 ? 0 : current + 1);
    event.preventDefault();
    focusable[next]?.focus();
  }

  if (!open) return null;

  return createPortal(
    <div className="cmdk-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={panelRef} className="cmdk-panel" role="dialog" aria-modal="true" aria-labelledby="cmdk-title" aria-describedby="cmdk-description" onKeyDown={onPanelKeyDown}>
        <header className="cmdk-header">
          <span className="cmdk-title-icon"><Sparkle weight="fill" /></span>
          <div><h2 id="cmdk-title">Research Agent</h2><p id="cmdk-description">选择一项研究任务，AI 将基于当前项目执行。</p></div>
          <button type="button" className="cmdk-close" onClick={close} aria-label="关闭 Research Agent"><X /></button>
        </header>
        {error ? <div className="cmdk-warn" role="alert"><Warning /><span>请先进入一个研究项目，再使用该能力。</span></div> : null}
        {status ? <div className="cmdk-status">{status}</div> : null}
        <div className="cmdk-groups">
          {GROUPS.map((group) => (
            <section className="cmdk-group" key={group.id} aria-labelledby={`cmdk-group-${group.id}`}>
              <h3 id={`cmdk-group-${group.id}`}>{group.label}</h3>
              <div className="cmdk-list" role="listbox" aria-label={group.label}>
                {ACTIONS.filter((action) => action.group === group.id).map((action) => {
                  const index = ACTIONS.indexOf(action);
                  const disabled = action.needsProject && !context.projectId;
                  return (
                    <button
                      key={action.id}
                      ref={(element) => { actionRefs.current[index] = element; }}
                      type="button"
                      role="option"
                      aria-selected={index === active}
                      className={`cmdk-item${index === active ? " active" : ""}${disabled ? " disabled" : ""}`}
                      aria-disabled={disabled}
                      onFocus={() => setActive(index)}
                      onMouseEnter={() => setActive(index)}
                      onKeyDown={(event) => onActionKeyDown(event, index)}
                      onClick={() => execute(action)}
                    >
                      <span className="cmdk-item-icon">{action.icon}</span>
                      <span className="cmdk-item-text"><strong>{action.label}</strong><small>{action.hint}</small></span>
                      <span className="cmdk-item-badge">{disabled ? "需先进入项目" : action.badge}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

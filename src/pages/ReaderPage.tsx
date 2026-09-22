import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowsClockwise, ArrowsOutLineHorizontal, BookOpenText, BookmarkSimple, Check, FilePdf, ListBullets, MagnifyingGlass, Minus, NotePencil, Plus, Quotes, Scan, Sparkle, Trash, Translate, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { askReader, downloadPaperFile, syncPaper, syncProject, translateSelection, uploadPaperFile } from "../api";
import { PdfPage, type PdfHighlight, type SelectionPayload } from "../components/PdfPage";
import { EmptyState, LoadingState } from "../components/states";
import { pickBubbleAnchor, type PageRect } from "../pdf/selection";
import { getPageTranslations, getPaperPageTexts, getPaperPdf, savePageTranslations, savePaperPdf } from "../storage/paperFiles";
import { useWorkspace } from "../state/workspace";
import { currentPageText, extractPdfText, inspectPdf, recognizePdfPage, sha256File } from "../pdf/document";
import { splitPageIntoBlocks } from "../pdf/blocks";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
// 与 server/routes/reader.ts translateSchema 的 max(8_000) 对齐:超长选区(整页/整段)
// 在前端就给明确提示,不消耗一次 AI 请求,也不让服务端返回文不对题的报错。
const TRANSLATE_MAX_CHARS = 8_000;
// 双语对照:一页同时最多几个段落在飞。固定值,不随页大小变 —— 段已经切到 ~400 字符,
// 单个请求的输出远低于服务端 maxTokens(2000),不会出现静默截断。
const COMPARE_CONCURRENCY = 3;
// 连续失败这么多段就停掉整页:第一段可能是偶发,第二段基本是配置/网络问题。
const COMPARE_MAX_CONSECUTIVE_FAILURES = 2;

/** 双语对照的一个段落:原文 + 翻译状态机。 */
interface CompareBlock {
  source: string;
  status: "idle" | "pending" | "done" | "error";
  translation: string;
  model?: string;
  error?: string;
}

/** 中文论文 → 译成英文,英文论文 → 译成中文。划词气泡与双语对照必须用同一套判断。 */
function targetLanguageFor(text: string): "中文" | "English" {
  return /[\u4e00-\u9fff]/.test(text) ? "English" : "中文";
}

export function ReaderPage() {
  const { projectId = "", paperId = "" } = useParams<{ projectId: string; paperId: string }>();
  const navigate = useNavigate();
  const { projects, papers, readerAnswers, readerExcerpts, readerPositions, settings, setPaperFile, updatePaper, addReaderAnswer, addReaderExcerpt, addKnowledge, updateReaderExcerpt, deleteReaderExcerpt, setReaderPosition } = useWorkspace();
  const project = projects.find((item) => item.id === projectId);
  const paper = papers.find((item) => item.id === paperId && item.projectIds.includes(projectId));
  const libraryPath = project ? `/projects/${encodeURIComponent(project.id)}/library` : "/library";
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const savedPosition = readerPositions.find((item) => item.projectId === projectId && item.paperId === paperId);
  const [pageNumber, setPageNumber] = useState(savedPosition?.page ?? 1);
  const [scale, setScale] = useState(savedPosition?.scale ?? 1.15);
  const [selection, setSelection] = useState("");
  // 划词气泡:rects 是与缩放无关的 PDF 页面单位矩形(用于在原文上重绘高亮),
  // selectionPage 记下这批矩形属于哪一页,翻页后存量的矩形不再复用。
  const [selectionRects, setSelectionRects] = useState<PageRect[]>([]);
  const [selectionPage, setSelectionPage] = useState(0);
  const [bubbleAnchor, setBubbleAnchor] = useState<{ top: number; left: number; placement: "above" | "below" } | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [model, setModel] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ page: number; excerpt: string }>>([]);
  const [excerptNote, setExcerptNote] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState("");
  // 同一句译过一次就不再打 AI:划词连点/反复选中同一句时零成本。
  const translationCache = useRef(new Map<string, string>());
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [editingExcerptId, setEditingExcerptId] = useState("");
  const [error, setError] = useState("");
  // 双语对照:右栏「批注 | 对照」标签,外加一个可选的宽屏模式(隐藏侧栏,PDF 与译文左右分栏)。
  const [readerTab, setReaderTab] = useState<"notes" | "compare">("notes");
  const [compareWide, setCompareWide] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareSource, setCompareSource] = useState<"native" | "ocr" | "empty">("empty");
  const [compareLanguage, setCompareLanguage] = useState<"中文" | "English">("中文");
  const [compareBlocks, setCompareBlocks] = useState<CompareBlock[]>([]);
  const [comparePhase, setComparePhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [compareError, setCompareError] = useState("");
  // OCR 完成后对照面板要重新读一次本页文本 → 用 nonce 触发上面那个 effect 重跑。
  const [ocrNonce, setOcrNonce] = useState(0);
  // 轮次令牌:翻页 / 取消 / 重译都换一个新值,回填前比对,不一致就丢弃在途结果。
  // 比布尔标志稳 —— "翻走又翻回来"叠加在途请求时不会把上一页的译文写进这一页。
  const compareRunId = useRef(0);
  // 并发的唯一真相源:三个 worker 同时回填,若从渲染闭包里的 compareBlocks 推导会互相覆盖。
  const compareBlocksRef = useRef<CompareBlock[]>([]);
  // 这些块属于哪一页 / 哪种目标语言。落盘必须按"块所属的那一页"写 ——
  // 翻页后 effect 里的 pageNumber 已经是新页,直接用会把上一页的译文写进新页的键。
  const compareContextRef = useRef<{ page: number; language: "中文" | "English" } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const legacyEntryBelongsHere = paper?.projectIds.length === 1 && paper.projectIds[0] === projectId;
  const history = useMemo(() => readerAnswers.filter((item) => item.paperId === paperId && (item.projectId === projectId || (!item.projectId && legacyEntryBelongsHere))), [legacyEntryBelongsHere, paperId, projectId, readerAnswers]);
  const excerpts = useMemo(() => readerExcerpts.filter((item) => item.paperId === paperId && (item.projectId === projectId || (!item.projectId && legacyEntryBelongsHere))), [legacyEntryBelongsHere, paperId, projectId, readerExcerpts]);
  // 当前页上带几何坐标的摘录 → PDF 原文上的彩色高亮块。
  const highlights = useMemo<PdfHighlight[]>(() => excerpts
    .filter((item) => item.page === pageNumber && (item.rects?.length ?? 0) > 0)
    .map((item) => ({ id: item.id, rects: item.rects ?? [], note: item.note, kind: item.kind })), [excerpts, pageNumber]);

  // workspace 方法(updatePaper 等)每次工作区数据变化都会换新 identity,
  // 绝不能进 useCallback/useEffect 依赖:否则 updatePaper → setData → 新方法 →
  // loadBlob 重建 → effect 重跑 → 再 updatePaper → 无限重载 PDF 死循环。
  // 用 ref 桥接,effect 只依赖 paperId。见 ERR-20260814-002。
  const updatePaperRef = useRef(updatePaper);
  updatePaperRef.current = updatePaper;
  const paperRef = useRef(paper);
  paperRef.current = paper;
  const setReaderPositionRef = useRef(setReaderPosition);
  setReaderPositionRef.current = setReaderPosition;

  // 气泡只认"选中时"的视口位置:.pdf-stage 一滚动就失锚,所以滚动/尺寸变化即收起。
  function dismissBubble() { setBubbleAnchor(null); }

  useEffect(() => {
    if (!bubbleAnchor) return;
    const stage = stageRef.current;
    stage?.addEventListener("scroll", dismissBubble, { passive: true });
    window.addEventListener("resize", dismissBubble);
    return () => {
      stage?.removeEventListener("scroll", dismissBubble);
      window.removeEventListener("resize", dismissBubble);
    };
  }, [bubbleAnchor]);

  useEffect(() => {
    if (!bubbleAnchor) return;
    // 点气泡以外任意处 / Esc → 收起。capture 阶段拦截,避免先触发别处的 pointerup。
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && bubbleRef.current?.contains(event.target)) return;
      setBubbleAnchor(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setBubbleAnchor(null);
    }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [bubbleAnchor]);

  const loadBlob = useCallback(async (blob: Blob) => {
    setLoading(true);
    setError("");
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const loaded = await getDocument({ data: bytes }).promise;
      setDocument(loaded);
      const metadata = await inspectPdf(blob);
      updatePaperRef.current(paperId, { pageCount: metadata.pageCount, outline: metadata.outline, authors: metadata.authors || paperRef.current?.authors });
      setPageNumber((current) => Math.min(Math.max(1, current), loaded.numPages));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "无法解析该 PDF");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function resolvePdf() {
      try {
        let blob = await getPaperPdf(paperId);
        if (!blob) {
          // 本地 IndexedDB 未命中 → 回退云端(Turso 内嵌 PDF);拉到后缓存到本地,下次秒开。
          blob = await downloadPaperFile(paperId);
          if (blob) {
            await savePaperPdf(paperId, new File([blob], `${paperId}.pdf`, { type: "application/pdf" }));
          }
        }
        if (cancelled) return;
        if (blob) await loadBlob(blob);
        else setLoading(false);
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "无法读取 PDF");
          setLoading(false);
        }
      }
    }
    void resolvePdf();
    return () => { cancelled = true; };
  }, [loadBlob, paperId]);

  useEffect(() => {
    if (!document) { setPdfPage(null); return; }
    let cancelled = false;
    setLoading(true);
    void document.getPage(pageNumber).then((loadedPage) => {
      if (!cancelled) setPdfPage(loadedPage);
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : "页面加载失败");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [document, pageNumber]);

  useEffect(() => () => { if (document) void document.destroy(); }, [document]);

  // 双语对照:进入对照 / 翻页 / OCR 后重跑时,取当前页文本 → 切块 → 填缓存。
  // 依赖里刻意不放 workspace 方法(ERR-20260814-002),只放页面身份。
  useEffect(() => {
    // 离开对照 / 翻页 / OCR 后重跑之前,先把上一批已译完的段落落盘。
    // 用的是 compareContextRef 里那一页的 key,所以翻页时不会写错地方;
    // 没有已译段落时 flush 自己会跳过。花钱买来的译文不该因为切个标签就丢缓存。
    if (compareBlocksRef.current.some((block) => block.status === "done")) {
      void flushCompareTranslations().catch(() => { /* 缓存写失败不影响阅读 */ });
    }
    // 任何一次新的上下文都作废在途翻译,否则上一页的译文会被回填进这一页。
    compareRunId.current += 1;
    compareBlocksRef.current = [];
    compareContextRef.current = null;
    setCompareBlocks([]);
    setComparePhase("idle");
    setCompareError("");
    if (readerTab !== "compare" || !pdfPage) return;
    let cancelled = false;
    setCompareLoading(true);
    void (async () => {
      const current = await currentPageText(pdfPage, paperId);
      if (cancelled) return;
      setCompareSource(current.source);
      if (!current.text) { setCompareLoading(false); return; }
      const blocks: CompareBlock[] = splitPageIntoBlocks(current.text).map((source) => ({ source, status: "idle", translation: "" }));
      compareBlocksRef.current = blocks;
      setCompareBlocks(blocks);
      setCompareLoading(false);
      // 中文论文 → 译成英文;英文论文 → 译成中文。与划词气泡同一套判断。
      const language = targetLanguageFor(current.text);
      setCompareLanguage(language);
      compareContextRef.current = { page: pageNumber, language };
      // 缓存命中就直接填上:翻回来看过的页不该再花一次钱、再等一遍。
      // 必须逐段比对原文 —— 换过 PDF 后页码不变、文本已变,只按页码命中就是静默错译。
      const stored = await getPageTranslations(paperId, pageNumber, language);
      if (cancelled || !stored) return;
      const pageText = blocks.map((block) => block.source).join(" ");
      if (stored.source !== pageText) return;
      const restored = blocks.map((block, index) => {
        const hit = stored.blocks.find((entry) => entry.index === index && entry.source === block.source);
        return hit ? { ...block, status: "done" as const, translation: hit.translation, model: hit.model } : block;
      });
      compareBlocksRef.current = restored;
      setCompareBlocks(restored);
    })().catch(() => {
      if (cancelled) return;
      setCompareLoading(false);
      setCompareSource("empty");
    });
    return () => { cancelled = true; };
  }, [readerTab, pdfPage, pageNumber, ocrNonce, paperId]);

  useEffect(() => {
    if (!document) return;
    const timer = window.setTimeout(() => setReaderPositionRef.current({ projectId, paperId, page: pageNumber, scale }), 350);
    return () => window.clearTimeout(timer);
  }, [document, pageNumber, paperId, projectId, scale]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setError("请选择 PDF 文件"); return; }
    if (file.size > MAX_FILE_SIZE) { setError("PDF 不能超过 25 MB"); return; }
    try {
      await savePaperPdf(paperId, file);
      setPaperFile(paperId, { name: file.name, size: file.size });
      const metadata = await inspectPdf(file);
      const hash = await sha256File(file);
      updatePaper(paperId, { fileHash: hash, pageCount: metadata.pageCount, outline: metadata.outline, authors: metadata.authors || paper?.authors });
      if (project && paper) {
        await syncProject(project);
        await syncPaper(project.id, { ...paper, fileHash: hash });
        try {
          await uploadPaperFile(paperId, file);
        } catch {
          // 云端(Turso)上传失败不阻塞本地阅读;PDF 已在 IndexedDB,可稍后重传。
        }
      }
      await loadBlob(file);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "PDF 保存失败");
    }
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paper || question.trim().length < 2 || asking) return;
    setAsking(true); setError(""); setAnswer("");
    try {
      // 无选区时对全文提问:提取论文全文文本(≤15K)随请求发送,后端按全文上下文回答。
      let fullText = "";
      if (selection.trim().length < 10) {
        const blob = await getPaperPdf(paperId);
        if (blob) {
          const pages = await extractPdfText(blob, paperId, { maxPages: 80, maxChars: 15_000 });
          fullText = pages.map((page) => `[第 ${page.page} 页] ${page.text}`).join("\n").slice(0, 15_000);
        }
        if (!fullText) {
          setError("无法读取论文文本，请先上传 PDF 或选择一段原文。");
          return;
        }
      }
      const result = await askReader({
        paper: { id: paper.id, title: paper.title, authors: paper.authors, year: paper.year },
        page: pageNumber,
        selection: selection.trim().length >= 10 ? selection : "",
        ...(fullText ? { fullText } : {}),
        question: question.trim(),
      });
      setAnswer(result.answer); setModel(result.model);
      addReaderAnswer({ projectId, paperId: paper.id, page: pageNumber, selection, question: question.trim(), answer: result.answer, model: result.model, createdAt: result.generatedAt });
      setQuestion("");
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "AI 回答失败");
    } finally { setAsking(false); }
  }

  async function searchDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim().toLowerCase();
    if (!document || query.length < 2 || searching) return;
    setSearching(true); setSearchResults([]); setError("");
    try {
      const matches: Array<{ page: number; excerpt: string }> = [];
      const ocrPages = await getPaperPageTexts(paperId);
      for (let number = 1; number <= document.numPages && matches.length < 30; number += 1) {
        const sourcePage = await document.getPage(number);
        const content = await sourcePage.getTextContent();
        const nativeText = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ");
        const text = nativeText.trim().length >= 40 ? nativeText : ocrPages[number] ?? nativeText;
        const index = text.toLowerCase().indexOf(query);
        if (index >= 0) matches.push({ page: number, excerpt: text.slice(Math.max(0, index - 70), index + query.length + 100) });
      }
      setSearchResults(matches);
      if (matches.length === 0) setError("未找到匹配文字；如果这是扫描 PDF，需要先进行 OCR。");
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "全文搜索失败");
    } finally { setSearching(false); }
  }

  // PDF 选区变化 → 同步侧栏文本框 + 气泡锚点。空选区(在原文区单击)即收起气泡。
  function handleSelect(payload: SelectionPayload) {
    setSelection(payload.text);
    setSelectionRects(payload.rects);
    setSelectionPage(payload.text ? pageNumber : 0);
    // 换了选区就收掉上一段的译文:气泡和侧栏卡片共用同一个 translation,
    // 不清就会让新选区顶着一句"别人的翻译",违反 AI 推断须与来源可区分的规则。
    // 同句重译不花钱——translationCache 命中即返回。
    setTranslation("");
    if (!payload.text || !payload.clientRect) {
      setBubbleAnchor(null);
      return;
    }
    setBubbleAnchor(pickBubbleAnchor(payload.clientRect, { width: window.innerWidth, height: window.innerHeight }));
  }

  function clearSelection() {
    setSelection("");
    setSelectionRects([]);
    setSelectionPage(0);
    setBubbleAnchor(null);
    window.getSelection()?.removeAllRanges();
  }

  // 只有"当前页选中"的矩形才能贴到这一页的摘录上;翻页后的旧矩形直接丢弃。
  function currentSelectionRects(): PageRect[] | undefined {
    return selectionPage === pageNumber && selectionRects.length ? selectionRects : undefined;
  }

  // 点 PDF 原文上的高亮块 → 跳到对应页、回填选区、打开该摘录的侧栏编辑框。
  function openAnchoredExcerpt(id: string) {
    const item = excerpts.find((entry) => entry.id === id);
    if (!item) return;
    if (item.page !== pageNumber) setPageNumber(item.page);
    setSelection(item.text);
    setSelectionRects(item.rects ?? []);
    setSelectionPage(item.page);
    setBubbleAnchor(null);
    setEditingExcerptId(id);
  }

  function saveExcerpt(kind: "note" | "evidence") {
    if (selection.length < 2) return;
    addReaderExcerpt({ projectId, paperId, page: pageNumber, text: selection, note: excerptNote.trim(), kind, rects: currentSelectionRects() });
    addKnowledge({ projectId, paperId, page: pageNumber, kind, title: excerptNote.trim() || `${kind === "evidence" ? "证据" : "笔记"} · 第 ${pageNumber} 页`, content: selection, note: excerptNote.trim(), source: "human", status: "draft" });
    setExcerptNote("");
    setSavedMessage(kind === "evidence" ? "已保存为证据摘录" : "已保存为阅读笔记");
    clearSelection();
    window.setTimeout(() => setSavedMessage(""), 1800);
  }

  function saveHighlight() {
    if (selection.length < 2) return;
    addReaderExcerpt({ projectId, paperId, page: pageNumber, text: selection, note: excerptNote.trim(), kind: "highlight", color: "yellow", rects: currentSelectionRects() });
    setExcerptNote(""); setSavedMessage("已保存高亮"); clearSelection();
    window.setTimeout(() => setSavedMessage(""), 1800);
  }

  async function translate() {
    if (!paper || selection.length < 2 || translating) return;
    // 选区过长先在前端挡掉:服务端上限 8000 字符,整页/整段选中是常见误操作,
    // 不能让用户等到一次网络往返再拿到一句文不对题的报错。
    if (selection.trim().length > TRANSLATE_MAX_CHARS) {
      setError(`一次最多翻译 ${TRANSLATE_MAX_CHARS} 个字符,请缩小选区后重试。`);
      return;
    }
    // 同一句译过一次就不再打 AI:划词连点/反复选中同一句时零成本。
    const cached = translationCache.current.get(selection);
    if (cached !== undefined) { setTranslation(cached); return; }
    setTranslating(true); setTranslation(""); setError("");
    try {
      const targetLanguage = targetLanguageFor(selection);
      const result = await translateSelection({ text: selection, targetLanguage, paperTitle: paper.title, page: pageNumber });
      translationCache.current.set(selection, result.translation);
      setTranslation(result.translation);
    } catch (translateError) { setError(translateError instanceof Error ? translateError.message : "翻译失败"); }
    finally { setTranslating(false); }
  }

  async function runOcr() {
    if (!pdfPage || ocrProgress !== null) return;
    setOcrProgress(0); setError("");
    try {
      const text = await recognizePdfPage(pdfPage, paperId, setOcrProgress);
      setSelection(text); setSavedMessage(`第 ${pageNumber} 页 OCR 完成，可搜索与提取`);
      // 对照面板可能正显示"这一页没有文字":OCR 出了文本就让它重新切块。
      setOcrNonce((value) => value + 1);
    } catch (ocrError) { setError(ocrError instanceof Error ? ocrError.message : "OCR 失败"); }
    finally { setOcrProgress(null); }
  }

  // ── 双语对照 ────────────────────────────────────────────────────────────
  // 进度从"已完成段数"现算,不累加:三个 worker 并发回填时累加会重复计数。
  const compareDone = compareBlocks.filter((block) => block.status === "done").length;
  const compareTotal = compareBlocks.length;
  const comparePending = compareTotal - compareDone;

  function patchCompareBlock(index: number, patch: Partial<CompareBlock>, runId: number) {
    if (compareRunId.current !== runId) return;
    const next = compareBlocksRef.current.map((block, position) => (position === index ? { ...block, ...patch } : block));
    compareBlocksRef.current = next;
    setCompareBlocks(next);
  }

  async function translateCompareBlock(block: CompareBlock): Promise<{ translation: string; model: string }> {
    // 划词气泡译过的段落直接命中:同一段文字不重复花钱。
    const cached = translationCache.current.get(block.source);
    if (cached !== undefined) return { translation: cached, model: "内存缓存" };
    const result = await translateSelection({ text: block.source, targetLanguage: compareLanguage, paperTitle: paper?.title ?? "", page: pageNumber });
    translationCache.current.set(block.source, result.translation);
    return result;
  }

  /** 译一段。返回 false 表示失败(已把该段标成 error)。 */
  async function runCompareBlock(index: number, runId: number): Promise<boolean> {
    const block = compareBlocksRef.current[index];
    if (!block) return true;
    patchCompareBlock(index, { status: "pending", error: "" }, runId);
    try {
      const result = await translateCompareBlock(block);
      patchCompareBlock(index, { status: "done", translation: result.translation, model: result.model }, runId);
      return true;
    } catch (translateError) {
      patchCompareBlock(index, { status: "error", error: translateError instanceof Error ? translateError.message : "翻译失败" }, runId);
      return false;
    }
  }

  /** 把已完成的段落写进 IndexedDB。整页一次写入,避免每段写造成的 read-modify-write 竞态。 */
  async function flushCompareTranslations() {
    const context = compareContextRef.current;
    if (!context) return;
    const done = compareBlocksRef.current
      .map((block, index) => ({ block, index }))
      .filter((entry) => entry.block.status === "done");
    if (!done.length) return;
    await savePageTranslations(paperId, context.page, context.language, {
      source: compareBlocksRef.current.map((block) => block.source).join(" "),
      blocks: done.map((entry) => ({ index: entry.index, source: entry.block.source, translation: entry.block.translation, model: entry.block.model ?? "" })),
    });
  }

  async function translateCurrentPage() {
    if (!paper || comparePhase === "working") return;
    const pending = compareBlocksRef.current
      .map((_, index) => index)
      .filter((index) => compareBlocksRef.current[index].status !== "done");
    if (!pending.length) { setComparePhase("done"); return; }
    compareContextRef.current = { page: pageNumber, language: compareLanguage };
    const runId = ++compareRunId.current;
    setComparePhase("working"); setCompareError("");
    let stopped = false;
    let failures = 0;
    let cursor = 0;
    // 共享游标 worker 池:三个 worker 抢同一个下标,取不到就退出。结果按 index 归位,
    // 与完成顺序无关;不需要队列,也不需要按完成顺序拼接。
    const worker = async () => {
      while (cursor < pending.length) {
        const index = pending[cursor];
        cursor += 1;
        if (stopped || compareRunId.current !== runId) return;
        if (await runCompareBlock(index, runId)) {
          failures = 0;
          continue;
        }
        failures += 1;
        if (failures >= COMPARE_MAX_CONSECUTIVE_FAILURES) {
          stopped = true;
          setCompareError(compareBlocksRef.current[index].error ?? "翻译失败");
          setComparePhase("error");
          return;
        }
      }
    };
    await Promise.all(Array.from({ length: COMPARE_CONCURRENCY }, () => worker()));
    if (stopped || compareRunId.current !== runId) return;
    await flushCompareTranslations();
    setComparePhase("done");
  }

  function cancelCompareTranslation() {
    compareRunId.current += 1;
    // 在途那一段的占位撤回 idle,不然它会永远停在"翻译中"。
    const reset = compareBlocksRef.current.map((block) => (block.status === "pending" ? { ...block, status: "idle" as const } : block));
    compareBlocksRef.current = reset;
    setCompareBlocks(reset);
    setComparePhase("idle");
    // 取消也要落盘:已经译完的段落是花过钱的,不写就白译了。
    void flushCompareTranslations().catch(() => { /* 缓存写失败不影响阅读 */ });
  }

  async function retryCompareBlock(index: number) {
    if (comparePhase === "working") return;
    compareContextRef.current = { page: pageNumber, language: compareLanguage };
    const runId = ++compareRunId.current;
    setComparePhase("working"); setCompareError("");
    if (await runCompareBlock(index, runId)) {
      if (compareRunId.current === runId) await flushCompareTranslations();
    } else if (compareRunId.current === runId) {
      setCompareError(compareBlocksRef.current[index].error ?? "翻译失败");
    }
    if (compareRunId.current === runId) setComparePhase("idle");
  }

  /** 点对照里的英文段 → 回填选区并切回批注标签,高亮/笔记/证据按钮立即可用。 */
  function annotateCompareBlock(source: string) {
    setSelection(source);
    setSelectionRects([]);
    setSelectionPage(0);
    setBubbleAnchor(null);
    setReaderTab("notes");
  }

  if (!paper) return <div className="reader-missing"><EmptyState icon={<BookOpenText />} title="当前项目中没有这篇文献" description="阅读器只允许打开当前项目关联的论文。" action={<button className="primary" onClick={() => navigate(libraryPath)}>返回项目文献库</button>} /></div>;

  return <div className="reader-page">
    <header className="reader-header"><div className="reader-title"><button className="icon-button" onClick={() => navigate(libraryPath)} aria-label="返回项目文献库"><ArrowLeft /></button><FilePdf weight="duotone" /><div><span className="eyebrow">{project?.name}</span><h1>{paper.title}</h1><small>{paper.authors} · {paper.venue} {paper.year}</small></div></div><label className="secondary-button upload-button"><UploadSimple />{document ? "更换 PDF" : "上传 PDF"}<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} /></label></header>
    <div className="reader-layout" data-reader-mode={readerTab === "compare" && compareWide ? "compare" : "notes"}>
      <section className="reader-document">
        <div className="reader-toolbar"><div className="outline-control"><button className="icon-button" disabled={!paper.outline?.length} onClick={() => setOutlineOpen((value) => !value)} aria-label="文档目录"><ListBullets /></button>{outlineOpen && paper.outline?.length ? <nav className="reader-outline" aria-label="PDF 目录">{paper.outline.map((item, index) => <button key={`${item.page}-${index}`} onClick={() => { setPageNumber(item.page); setOutlineOpen(false); }}><span>{item.title}</span><small>{item.page}</small></button>)}</nav> : null}<button className="icon-button" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}><ArrowLeft /></button><label><input type="number" min={1} max={document?.numPages ?? 1} value={pageNumber} onChange={(event) => setPageNumber(Math.min(document?.numPages ?? 1, Math.max(1, Number(event.target.value) || 1)))} /> / {document?.numPages ?? 0}</label><button className="icon-button" disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber((value) => value + 1)}><ArrowRight /></button></div><form className="reader-search" onSubmit={(event) => void searchDocument(event)}><MagnifyingGlass /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="全文搜索" /><button disabled={!document || searchQuery.trim().length < 2 || searching}>{searching ? "搜索中" : "搜索"}</button>{searchResults.length ? <div className="search-results">{searchResults.map((result) => <button type="button" key={`${result.page}-${result.excerpt}`} onClick={() => { setPageNumber(result.page); setSearchResults([]); }}><strong>第 {result.page} 页</strong><span>{result.excerpt}</span></button>)}</div> : null}</form><button className="secondary-button ocr-button" disabled={!pdfPage || ocrProgress !== null} onClick={() => void runOcr()}><Scan />{ocrProgress !== null ? `OCR ${Math.round(ocrProgress * 100)}%` : "OCR 本页"}</button><div><button className="icon-button" onClick={() => setScale((value) => Math.max(.7, value - .15))}><Minus /></button><span>{Math.round(scale * 100)}%</span><button className="icon-button" onClick={() => setScale((value) => Math.min(2.2, value + .15))}><Plus /></button></div></div>
        <div className="pdf-stage" ref={stageRef}>{loading ? <LoadingState title="正在加载 PDF" /> : null}{!loading && error && !document ? <EmptyState icon={<WarningCircle />} title="无法打开 PDF" description={error} action={<label className="primary upload-button"><UploadSimple />重新选择<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} /></label>} /> : null}{!loading && !document ? <EmptyState icon={<FilePdf />} title="上传 PDF 开始阅读" action={<label className="primary upload-button"><UploadSimple />选择 PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} /></label>} /> : null}{document && pdfPage ? <PdfPage page={pdfPage} scale={scale} onSelect={handleSelect} highlights={highlights} onHighlightClick={openAnchoredExcerpt} /> : null}</div>
      </section>
      <aside className="reader-ai">
        <div className="reader-tabs" role="tablist" aria-label="右栏视图">
          <button type="button" role="tab" className="reader-tab" aria-selected={readerTab === "notes"} onClick={() => setReaderTab("notes")}><NotePencil />批注与问答</button>
          <button type="button" role="tab" className="reader-tab" aria-selected={readerTab === "compare"} onClick={() => setReaderTab("compare")}><Translate />双语对照</button>
        </div>
        {/* 用 CSS 隐藏而不是卸载:切走再切回时,写了一半的问题和摘录备注不该丢。 */}
        <div className="reader-notes" data-active={readerTab === "notes"}>
        <div className="reader-ai-intro"><Sparkle weight="duotone" /><div><strong>问 AI</strong><span>选中文字则基于选区回答；不选中则基于全文回答</span></div></div>
        <form onSubmit={(event) => void ask(event)}><label className="selection-box"><span><Quotes /> 当前选区 · 第 {pageNumber} 页</span><textarea value={selection} onChange={(event) => setSelection(event.target.value)} placeholder="在左侧 PDF 中拖动选择一段文字；留空则对全文提问…" maxLength={8000} /><small className={selection.length > TRANSLATE_MAX_CHARS ? "selection-count over" : "selection-count"}>{selection.length} / {TRANSLATE_MAX_CHARS}{selection.length > TRANSLATE_MAX_CHARS ? " · 超出翻译上限" : ""}</small></label><label className="excerpt-note"><span>摘录备注（可选）</span><input value={excerptNote} onChange={(event) => setExcerptNote(event.target.value)} placeholder="记录你的判断或用途" /></label><div className="excerpt-actions"><button type="button" disabled={selection.length < 2} onClick={saveHighlight}><BookmarkSimple />高亮</button><button type="button" disabled={selection.length < 2} onClick={() => saveExcerpt("note")}><NotePencil />笔记</button><button type="button" disabled={selection.length < 2} onClick={() => saveExcerpt("evidence")}><BookmarkSimple />证据</button><button type="button" disabled={selection.length < 2 || translating} onClick={() => void translate()}><Translate />{translating ? "翻译中" : "翻译"}</button><span>{savedMessage}</span></div>{translation ? <div className="translation-card"><strong>选区翻译</strong><p>{translation}</p></div> : null}<label className="question-box"><span>你想问什么？</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：作者为什么采用这个设计？未选中文字时将基于全文回答" maxLength={800} /></label><button className="primary ask-button" disabled={question.trim().length < 2 || asking}>{asking ? <><ArrowsClockwise className="spin" />正在回答</> : <><Sparkle />{selection.trim().length >= 10 ? "基于选区回答" : "基于全文回答"}</>}</button></form>
        {error && document ? <div className="reader-error"><WarningCircle />{error}</div> : null}
        {answer ? <article className="answer-card"><header><span><Check /> AI 回答</span><small>{model} · 第 {pageNumber} 页</small></header><p>{answer}</p>{selection.trim() ? <blockquote>{selection}</blockquote> : null}</article> : null}
        <section className="reader-history"><div className="section-heading"><div><span className="eyebrow">摘录与问答</span><h2>{excerpts.length} 条摘录 · {history.length} 次问答</h2></div></div>{excerpts.map((item) => <article className={`excerpt-card kind-${item.kind}`} key={item.id}><header><button onClick={() => setPageNumber(item.page)}>{item.kind === "evidence" || item.kind === "highlight" ? <BookmarkSimple /> : <NotePencil />}第 {item.page} 页</button><span><button className="icon-button subtle" onClick={() => setEditingExcerptId(item.id)} aria-label="编辑摘录"><NotePencil /></button><button className="icon-button subtle danger" onClick={() => deleteReaderExcerpt(item.id)} aria-label="删除摘录"><Trash /></button></span></header>{editingExcerptId === item.id ? <input defaultValue={item.note} autoFocus onBlur={(event) => { updateReaderExcerpt(item.id, { note: event.target.value, color: item.color }); setEditingExcerptId(""); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <strong>{item.note || (item.kind === "evidence" ? "证据摘录" : item.kind === "highlight" ? "文本高亮" : "阅读笔记")}</strong>}<p>{item.text}</p></article>)}{history.map((item) => <article key={item.id}><button onClick={() => { setPageNumber(item.page); setSelection(item.selection); }}><Quotes />第 {item.page} 页</button><strong>{item.question}</strong><p>{item.answer}</p><footer><span>{item.model}</span><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></footer></article>)}</section>
        </div>
        {readerTab === "compare" ? <section className="compare-pane" aria-label="双语对照">
          <header className="compare-head">
            <div className="compare-title"><Translate weight="duotone" /><div><strong>双语对照 · 第 {pageNumber} 页</strong><small>{compareSource === "native" ? "PDF 文本层" : compareSource === "ocr" ? "本机 OCR 文本" : "无可用文本"}{compareTotal ? ` · ${compareTotal} 段 · 译成${compareLanguage}` : ""}</small></div></div>
            <div className="compare-head-actions">
              <button type="button" className="secondary-button" aria-pressed={compareWide} onClick={() => setCompareWide((value) => !value)}><ArrowsOutLineHorizontal /><span>宽屏对照</span></button>
              <button type="button" className="icon-button" aria-label="关闭双语对照" onClick={() => setReaderTab("notes")}><X /></button>
            </div>
          </header>
          <div className="compare-toolbar">
            {comparePhase === "working"
              ? <button type="button" className="secondary-button" onClick={cancelCompareTranslation}><X />取消翻译</button>
              : <button type="button" className="primary" disabled={!comparePending} onClick={() => void translateCurrentPage()}><Translate />{comparePending === compareTotal ? "翻译本页" : `翻译剩余 ${comparePending} 段`}</button>}
            <span className="compare-progress">已完成 {compareDone} / {compareTotal} 段{comparePhase === "working" ? " · 翻译中" : ""}</span>
            {compareError || error ? <span className="compare-error-text">{compareError || error}</span> : null}
          </div>
          <div className="compare-blocks">
            {compareLoading ? <LoadingState title="正在读取本页文本" /> : null}
            {!compareLoading && !compareTotal ? (pdfPage
              ? <EmptyState icon={<Scan />} title="这一页没有可翻译的文字" description="扫描版 PDF 需要先做 OCR，识别结果只保存在本机。" action={<button type="button" className="primary" disabled={!pdfPage || ocrProgress !== null} onClick={() => void runOcr()}><Scan />{ocrProgress !== null ? `OCR ${Math.round(ocrProgress * 100)}%` : "OCR 本页"}</button>} />
              : <EmptyState icon={<FilePdf />} title="等待 PDF 加载" description="左侧 PDF 加载完成后，即可按段对照阅读。" />) : null}
            {compareBlocks.map((block, index) => <article className="compare-block" data-status={block.status} key={index}>
              <p className="compare-source">{block.source}</p>
              {block.status === "pending" ? <p className="compare-target pending">翻译中…</p> : null}
              {block.status === "done" ? <p className="compare-target">{block.translation}</p> : null}
              {block.status === "error" ? <div className="compare-block-error"><span>{block.error || "翻译失败"}</span><button type="button" onClick={() => void retryCompareBlock(index)}>重试</button></div> : null}
              <footer><span>{block.model ?? (block.status === "done" ? "" : "未翻译")}</span><button type="button" onClick={() => annotateCompareBlock(block.source)}><NotePencil />记笔记</button></footer>
            </article>)}
          </div>
        </section> : null}
      </aside>
    </div>
    {/* 划词气泡:紧贴选区,翻译/高亮/笔记/证据一步到位。滚动即失锚 → 自动收起。 */}
    {bubbleAnchor && selection.length >= 2 ? <div ref={bubbleRef} className="selection-bubble" data-placement={bubbleAnchor.placement} role="group" aria-label="选区操作" style={{ top: bubbleAnchor.top, left: bubbleAnchor.left }}><div className="bubble-actions"><button type="button" disabled={translating} onClick={() => void translate()}><Translate />{translating ? "翻译中" : "翻译"}</button><button type="button" onClick={saveHighlight}><BookmarkSimple />高亮</button><button type="button" onClick={() => saveExcerpt("note")}><NotePencil />笔记</button><button type="button" onClick={() => saveExcerpt("evidence")}><BookmarkSimple />证据</button></div>{translation ? <div className="bubble-translation"><strong>译文</strong><p>{translation}</p></div> : null}</div> : null}
  </div>;
}

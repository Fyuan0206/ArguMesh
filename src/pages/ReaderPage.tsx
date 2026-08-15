import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowsClockwise, BookOpenText, BookmarkSimple, Check, FilePdf, ListBullets, MagnifyingGlass, Minus, NotePencil, Plus, Quotes, Scan, Sparkle, Trash, Translate, UploadSimple, WarningCircle } from "@phosphor-icons/react";
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import { askReader, downloadPaperFile, syncPaper, syncProject, translateSelection, uploadPaperFile } from "../api";
import { PdfPage } from "../components/PdfPage";
import { EmptyState, LoadingState } from "../components/states";
import { getPaperPageTexts, getPaperPdf, savePaperPdf } from "../storage/paperFiles";
import { useWorkspace } from "../state/workspace";
import { extractPdfText, inspectPdf, recognizePdfPage, sha256File } from "../pdf/document";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

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
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [editingExcerptId, setEditingExcerptId] = useState("");
  const [error, setError] = useState("");
  const legacyEntryBelongsHere = paper?.projectIds.length === 1 && paper.projectIds[0] === projectId;
  const history = useMemo(() => readerAnswers.filter((item) => item.paperId === paperId && (item.projectId === projectId || (!item.projectId && legacyEntryBelongsHere))), [legacyEntryBelongsHere, paperId, projectId, readerAnswers]);
  const excerpts = useMemo(() => readerExcerpts.filter((item) => item.paperId === paperId && (item.projectId === projectId || (!item.projectId && legacyEntryBelongsHere))), [legacyEntryBelongsHere, paperId, projectId, readerExcerpts]);

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

  function saveExcerpt(kind: "note" | "evidence") {
    if (selection.length < 2) return;
    addReaderExcerpt({ projectId, paperId, page: pageNumber, text: selection, note: excerptNote.trim(), kind });
    addKnowledge({ projectId, paperId, page: pageNumber, kind, title: excerptNote.trim() || `${kind === "evidence" ? "证据" : "笔记"} · 第 ${pageNumber} 页`, content: selection, note: excerptNote.trim(), source: "human", status: "draft" });
    setExcerptNote("");
    setSavedMessage(kind === "evidence" ? "已保存为证据摘录" : "已保存为阅读笔记");
    window.setTimeout(() => setSavedMessage(""), 1800);
  }

  function saveHighlight() {
    if (selection.length < 2) return;
    addReaderExcerpt({ projectId, paperId, page: pageNumber, text: selection, note: excerptNote.trim(), kind: "highlight", color: "yellow" });
    setExcerptNote(""); setSavedMessage("已保存高亮"); window.setTimeout(() => setSavedMessage(""), 1800);
  }

  async function translate() {
    if (!paper || selection.length < 2 || translating) return;
    setTranslating(true); setTranslation(""); setError("");
    try {
      const targetLanguage = /[\u4e00-\u9fff]/.test(selection) ? "English" : "中文";
      const result = await translateSelection({ text: selection, targetLanguage, paperTitle: paper.title, page: pageNumber });
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
    } catch (ocrError) { setError(ocrError instanceof Error ? ocrError.message : "OCR 失败"); }
    finally { setOcrProgress(null); }
  }

  if (!paper) return <div className="reader-missing"><EmptyState icon={<BookOpenText />} title="当前项目中没有这篇文献" description="阅读器只允许打开当前项目关联的论文。" action={<button className="primary" onClick={() => navigate(libraryPath)}>返回项目文献库</button>} /></div>;

  return <div className="reader-page">
    <header className="reader-header"><div className="reader-title"><button className="icon-button" onClick={() => navigate(libraryPath)} aria-label="返回项目文献库"><ArrowLeft /></button><FilePdf weight="duotone" /><div><span className="eyebrow">{project?.name}</span><h1>{paper.title}</h1><small>{paper.authors} · {paper.venue} {paper.year}</small></div></div><label className="secondary-button upload-button"><UploadSimple />{document ? "更换 PDF" : "上传 PDF"}<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} /></label></header>
    <div className="reader-layout">
      <section className="reader-document">
        <div className="reader-toolbar"><div className="outline-control"><button className="icon-button" disabled={!paper.outline?.length} onClick={() => setOutlineOpen((value) => !value)} aria-label="文档目录"><ListBullets /></button>{outlineOpen && paper.outline?.length ? <nav className="reader-outline" aria-label="PDF 目录">{paper.outline.map((item, index) => <button key={`${item.page}-${index}`} onClick={() => { setPageNumber(item.page); setOutlineOpen(false); }}><span>{item.title}</span><small>{item.page}</small></button>)}</nav> : null}<button className="icon-button" disabled={pageNumber <= 1} onClick={() => setPageNumber((value) => value - 1)}><ArrowLeft /></button><label><input type="number" min={1} max={document?.numPages ?? 1} value={pageNumber} onChange={(event) => setPageNumber(Math.min(document?.numPages ?? 1, Math.max(1, Number(event.target.value) || 1)))} /> / {document?.numPages ?? 0}</label><button className="icon-button" disabled={!document || pageNumber >= document.numPages} onClick={() => setPageNumber((value) => value + 1)}><ArrowRight /></button></div><form className="reader-search" onSubmit={(event) => void searchDocument(event)}><MagnifyingGlass /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="全文搜索" /><button disabled={!document || searchQuery.trim().length < 2 || searching}>{searching ? "搜索中" : "搜索"}</button>{searchResults.length ? <div className="search-results">{searchResults.map((result) => <button type="button" key={`${result.page}-${result.excerpt}`} onClick={() => { setPageNumber(result.page); setSearchResults([]); }}><strong>第 {result.page} 页</strong><span>{result.excerpt}</span></button>)}</div> : null}</form><button className="secondary-button ocr-button" disabled={!pdfPage || ocrProgress !== null} onClick={() => void runOcr()}><Scan />{ocrProgress !== null ? `OCR ${Math.round(ocrProgress * 100)}%` : "OCR 本页"}</button><div><button className="icon-button" onClick={() => setScale((value) => Math.max(.7, value - .15))}><Minus /></button><span>{Math.round(scale * 100)}%</span><button className="icon-button" onClick={() => setScale((value) => Math.min(2.2, value + .15))}><Plus /></button></div></div>
        <div className="pdf-stage">{loading ? <LoadingState title="正在加载 PDF" /> : null}{!loading && error && !document ? <EmptyState icon={<WarningCircle />} title="无法打开 PDF" description={error} action={<label className="primary upload-button"><UploadSimple />重新选择<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} /></label>} /> : null}{!loading && !document ? <EmptyState icon={<FilePdf />} title="上传 PDF 开始阅读" action={<label className="primary upload-button"><UploadSimple />选择 PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => void upload(event)} /></label>} /> : null}{document && pdfPage ? <PdfPage page={pdfPage} scale={scale} onSelect={setSelection} /> : null}</div>
      </section>
      <aside className="reader-ai">
        <div className="reader-ai-intro"><Sparkle weight="duotone" /><div><strong>问 AI</strong><span>选中文字则基于选区回答；不选中则基于全文回答</span></div></div>
        <form onSubmit={(event) => void ask(event)}><label className="selection-box"><span><Quotes /> 当前选区 · 第 {pageNumber} 页</span><textarea value={selection} onChange={(event) => setSelection(event.target.value)} placeholder="在左侧 PDF 中拖动选择一段文字；留空则对全文提问…" maxLength={8000} /><small>{selection.length} / 8000</small></label><label className="excerpt-note"><span>摘录备注（可选）</span><input value={excerptNote} onChange={(event) => setExcerptNote(event.target.value)} placeholder="记录你的判断或用途" /></label><div className="excerpt-actions"><button type="button" disabled={selection.length < 2} onClick={saveHighlight}><BookmarkSimple />高亮</button><button type="button" disabled={selection.length < 2} onClick={() => saveExcerpt("note")}><NotePencil />笔记</button><button type="button" disabled={selection.length < 2} onClick={() => saveExcerpt("evidence")}><BookmarkSimple />证据</button><button type="button" disabled={selection.length < 2 || translating} onClick={() => void translate()}><Translate />{translating ? "翻译中" : "翻译"}</button><span>{savedMessage}</span></div>{translation ? <div className="translation-card"><strong>选区翻译</strong><p>{translation}</p></div> : null}<label className="question-box"><span>你想问什么？</span><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：作者为什么采用这个设计？未选中文字时将基于全文回答" maxLength={800} /></label><button className="primary ask-button" disabled={question.trim().length < 2 || asking}>{asking ? <><ArrowsClockwise className="spin" />正在回答</> : <><Sparkle />{selection.trim().length >= 10 ? "基于选区回答" : "基于全文回答"}</>}</button></form>
        {error && document ? <div className="reader-error"><WarningCircle />{error}</div> : null}
        {answer ? <article className="answer-card"><header><span><Check /> AI 回答</span><small>{model} · 第 {pageNumber} 页</small></header><p>{answer}</p>{selection.trim() ? <blockquote>{selection}</blockquote> : null}</article> : null}
        <section className="reader-history"><div className="section-heading"><div><span className="eyebrow">摘录与问答</span><h2>{excerpts.length} 条摘录 · {history.length} 次问答</h2></div></div>{excerpts.map((item) => <article className={`excerpt-card kind-${item.kind}`} key={item.id}><header><button onClick={() => setPageNumber(item.page)}>{item.kind === "evidence" || item.kind === "highlight" ? <BookmarkSimple /> : <NotePencil />}第 {item.page} 页</button><span><button className="icon-button subtle" onClick={() => setEditingExcerptId(item.id)} aria-label="编辑摘录"><NotePencil /></button><button className="icon-button subtle danger" onClick={() => deleteReaderExcerpt(item.id)} aria-label="删除摘录"><Trash /></button></span></header>{editingExcerptId === item.id ? <input defaultValue={item.note} autoFocus onBlur={(event) => { updateReaderExcerpt(item.id, { note: event.target.value, color: item.color }); setEditingExcerptId(""); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <strong>{item.note || (item.kind === "evidence" ? "证据摘录" : item.kind === "highlight" ? "文本高亮" : "阅读笔记")}</strong>}<p>{item.text}</p></article>)}{history.map((item) => <article key={item.id}><button onClick={() => { setPageNumber(item.page); setSelection(item.selection); }}><Quotes />第 {item.page} 页</button><strong>{item.question}</strong><p>{item.answer}</p><footer><span>{item.model}</span><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time></footer></article>)}</section>
      </aside>
    </div>
  </div>;
}

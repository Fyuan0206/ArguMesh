import { BookOpenText, FolderSimple, GridFour, Lightbulb, MagnifyingGlass, NotePencil } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { useWorkspace } from "../state/workspace";

export function SearchPage() {
  const { projects, papers, matrices, ideas, knowledge } = useWorkspace(); const [query, setQuery] = useState(""); const normalized = query.trim().toLowerCase();
  const results = useMemo(() => normalized.length < 2 ? [] : [
    ...projects.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(normalized)).map((item) => ({ id: `project:${item.id}`, type: "项目", title: item.name, detail: item.description, to: `/projects/${item.id}`, icon: <FolderSimple /> })),
    ...papers.filter((item) => `${item.title} ${item.authors} ${item.tags.join(" ")} ${item.abstract ?? ""}`.toLowerCase().includes(normalized)).map((item) => ({ id: `paper:${item.id}`, type: "论文", title: item.title, detail: `${item.authors} · ${item.venue} ${item.year}`, to: `/projects/${item.projectIds[0]}/library/${item.id}`, icon: <BookOpenText /> })),
    ...matrices.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(normalized)).map((item) => ({ id: `matrix:${item.id}`, type: "矩阵", title: item.name, detail: item.description, to: `/projects/${encodeURIComponent(item.projectId)}/matrices/${encodeURIComponent(item.id)}`, icon: <GridFour /> })),
    ...ideas.filter((item) => `${item.title} ${item.summary} ${Object.values(item.canvas).join(" ")}`.toLowerCase().includes(normalized)).map((item) => ({ id: `idea:${item.id}`, type: "Idea", title: item.title, detail: item.summary, to: `/ideas/${item.id}/canvas`, icon: <Lightbulb /> })),
    ...knowledge.filter((item) => `${item.title} ${item.content} ${item.note}`.toLowerCase().includes(normalized)).map((item) => ({ id: `knowledge:${item.id}`, type: item.kind, title: item.title, detail: item.content, to: "/knowledge", icon: <NotePencil /> })),
  ], [ideas, knowledge, matrices, normalized, papers, projects]);
  return <div className="route-page search-page"><PageHeader eyebrow="Search" title="全局搜索" /><label className="global-search-input"><MagnifyingGlass /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入至少两个字符…" /><strong>{results.length} 个结果</strong></label><section className="search-result-list">{results.map((item) => <Link className="surface-card search-result" to={item.to} key={item.id}><span>{item.icon}</span><div><small>{item.type}</small><h2>{item.title}</h2><p>{item.detail}</p></div></Link>)}</section>{normalized.length >= 2 && results.length === 0 ? <EmptyState icon={<MagnifyingGlass />} title="没有匹配结果" /> : null}</div>;
}

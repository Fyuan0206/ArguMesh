import { ArrowsClockwise, CheckCircle, Clock, Trash, WarningCircle, X } from "@phosphor-icons/react";
import { PageHeader } from "../components/PageHeader";
import { EmptyState } from "../components/states";
import { useWorkspace } from "../state/workspace";

export function TasksPage() {
  const { tasks, projects, updateTask, clearFinishedTasks } = useWorkspace();
  return <div className="route-page"><PageHeader eyebrow="AI Researcher" title="任务中心" actions={<button className="secondary-button" onClick={clearFinishedTasks}><Trash />清除已结束任务</button>} />
    <section className="task-list">{tasks.map((task) => <article className="surface-card task-card" key={task.id}><div className={`task-status ${task.status}`}>{task.status === "completed" ? <CheckCircle weight="fill" /> : task.status === "failed" ? <WarningCircle weight="fill" /> : task.status === "running" ? <ArrowsClockwise className="spin" /> : <Clock />}</div><div><span className="eyebrow">{projects.find((project) => project.id === task.projectId)?.name ?? "工作区"}</span><h2>{task.title}</h2><p>{task.detail}</p><footer><span>{task.model}</span><time>{new Date(task.createdAt).toLocaleString("zh-CN")}</time></footer></div><aside><strong>{task.progress}%</strong><progress value={task.progress} max="100" />{task.status === "queued" || task.status === "running" ? <button onClick={() => updateTask(task.id, { status: "cancelled", detail: `${task.detail} · 已由用户取消` })}><X />取消</button> : <span>{task.status}</span>}</aside></article>)}</section>
    {tasks.length === 0 ? <EmptyState icon={<Clock />} title="目前没有任务" description="运行矩阵提取、PDF 解析或其他 AI 操作后，任务会显示在这里。" /> : null}
  </div>;
}

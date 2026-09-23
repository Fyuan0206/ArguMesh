# ArguMesh 组件规范

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

前端 UI 的写法约定。路由与页面行为见 [`PAGE-STRUCTURE.md`](PAGE-STRUCTURE.md)，架构见 [`ARCHITECTURE.md`](ARCHITECTURE.md)。

## 共享原语（优先复用，不要重造）

| 原语 | 位置 | 用途 |
| --- | --- | --- |
| `EmptyState` | `components/states.tsx` | 空矩阵 / 空搜索结果。`role="status"` |
| `LoadingState` | `components/states.tsx` | 加载中。`aria-busy="true"` |
| `ErrorState` | `components/states.tsx` | 行内错误面，可选「重试」按钮。`role="alert"` |
| `PageHeader` | `components/PageHeader.tsx` | 路由页标准头部：`eyebrow` / `title` / `description` / `actions`。内含移动端展开侧栏按钮（派发 `paperidea:toggle-sidebar`） |
| `useDialogKeyboard` | `components/useDialogKeyboard.ts` | 弹窗键盘交互：Escape 关闭 + Tab 焦点困在弹窗内循环 |
| `ProjectGate` | `components/ProjectGate.tsx` | 项目上下文闸门。**唯一真源是 URL 的 `:projectId`**（自己 `useParams()`，不收外部传入）；无 projectId 时渲染项目选择器。⚠ 目前唯一消费者是**未接线**的 `pages/GapsPage.tsx`（见 [`ARCHITECTURE.md`](ARCHITECTURE.md) 的残留页面清单），新建页面时不要依赖它，直接从 URL 取 projectId |
| `SyncBanner` | `components/SyncBanner.tsx` | 后台同步队列失败横幅，提供重试 / 忽略 |
| `BrandMark` | `components/BrandMark.tsx` | 品牌标志，`aria-hidden`（装饰性） |
| `AgentMarkdown` | `components/AgentMarkdown.tsx` | Research Agent 回复按 GFM 渲染（标题、列表、表格、代码） |

**所有 `createPortal` 弹窗统一接入 `useDialogKeyboard`**，与「点遮罩关闭」互补，保证纯键盘用户也能进出弹窗。返回的 ref 挂在弹窗根 `<form>` / `<div>` 上作为焦点陷阱边界。

## 样式

- **全部样式在 `src/styles.css` 一个文件里**，没有 CSS Modules、没有 CSS-in-JS、没有 Tailwind。
- 颜色 / 字体 token 在 `:root`，**新颜色必须走 token，不要写死 hex**：

  | Token | 值 | 用途 |
  | --- | --- | --- |
  | `--nav` | `#101d27` | 石墨色导航 |
  | `--nav-muted` | `#9eacb7` | 导航次级文字 |
  | `--ink` | `#172432` | 标题与正文主色 |
  | `--accent` | `#0788a2` | 青色操作强调 |
  | `--accent-dark` | `#056d82` | 深一级强调 |
  | `--line` | `#dbe2e7` | 分隔线 |
  | `--muted` | `#687683` | 次级文字 |
  | `--soft` | `#f5f7f8` | 浅色面板底 |
  | `--draft` | `#b7791f` | **琥珀色 = AI 草稿 / 待确认** |
  | `--success` | `#2f8b68` | 绿色 = 已确认 |

  字体：`--font-sans` / `--font-serif` / `--font-mono`。
- **AI 与人工必须可区分**：AI 生成 / 待确认的内容用 `--draft` 琥珀色，用户已确认的用 `--success` 绿色。这是产品规则，不只是配色偏好。
- 图标用 `@phosphor-icons/react`（全仓 28 个文件在用）。不要引第三套图标库。

## 无障碍

- 空态 / 加载态 / 错误态必须显式存在——不是可选项。用 `states.tsx` 的三个原语，它们已带好 `role` 与 `aria-busy`。
- 纯图标按钮必须给 `aria-label`（`PageHeader` 的侧栏切换、`SyncBanner` 的忽略按钮是范例）。
- 同步横幅用 `role="status" aria-live="polite"`。
- 弹窗焦点管理走 `useDialogKeyboard`。
- 交付前做一遍键盘 + 无障碍检查（见 [`DEVELOPMENT.md`](DEVELOPMENT.md) 的门禁）。

## 交互约定

- **不要新增产品级键盘快捷键。** 用户明确不想要。`src/` 里不存在 Cmd/Ctrl+K。弹窗内部的 Escape / Tab 属于焦点管理，不算产品快捷键。
- Research Agent 界面就是 `pages/ProjectHomePage.tsx` 的 agent composer（SSE 会话流 + `AgentMarkdown` + 可跳转引用）。不存在独立的命令面板入口。
- 项目上下文从 URL 派生，不要在组件间手传 projectId。
- 用户偏好**简单、清晰**的界面：减少次级控件和状态噪音，保持矩阵 + 核验流程醒目。

## 新增组件前

1. 能不能复用 `states.tsx` / `PageHeader` / `SyncBanner` / `AgentMarkdown`？
2. 空态、加载态、错误态分别是什么？
3. 内容是不是 AI 生成的？是的话用 `--draft`，并确保带出处（source / model / 时间）。
4. 纯键盘能不能走完？
5. 用户可见的行为变了？——那就要同任务改 README（见 [`DEVELOPMENT.md`](DEVELOPMENT.md) 的文档规则）。

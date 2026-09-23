# AGENTS.md

**仓库：[github.com/Fyuan0206/ArguMesh](https://github.com/Fyuan0206/ArguMesh)** · MIT License

面向所有编码 agent 的协作规范（`AGENTS.md` 是跨工具约定；Claude Code 另外会自动加载 [`CLAUDE.md`](CLAUDE.md)）。

本文件只放**必须遵守的规则**。命令、架构、页面细节都不在这里重复——按下方的文档地图去找。

## 文档地图

| 想知道什么 | 看哪个 |
| --- | --- |
| 怎么跑起来、怎么测、环境变量 | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) |
| 项目是什么、为谁做、不做什么 | [`docs/PROJECT-SPEC.md`](docs/PROJECT-SPEC.md) |
| 代码怎么组织的、29 张表、路由与服务 | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 有哪些页面、路由、旧链接兼容 | [`docs/PAGE-STRUCTURE.md`](docs/PAGE-STRUCTURE.md) |
| 组件怎么写、样式 token、无障碍 | [`docs/COMPONENT-GUIDELINES.md`](docs/COMPONENT-GUIDELINES.md) |
| 视觉方向、设计 QA 记录 | [`DESIGN.md`](DESIGN.md) |
| 版本历史 | [`CHANGELOG.md`](CHANGELOG.md) |
| 当前进度、**不要开工的项** | [`TODO.md`](TODO.md) |
| 怎么部署（本地 / 官网 / 桌面） | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| 品牌识别 | [`docs/brand-guidelines.md`](docs/brand-guidelines.md) |
| 同类产品对照 | [`docs/reference-projects.md`](docs/reference-projects.md) |

## 四条硬约束

1. **零云依赖。** 不要把 Cloudflare 绑定、wrangler 或 Turso 账号要求引进本项目。早前的 Cloudflare 版本在 `../prototype`，是刻意拆出去的。唯一的例外是 `website/` 目录——一个独立的静态官网 Worker，详见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。
2. **单用户，无租户。** 没有 `accountId`、没有归属层、没有鉴权。**不要重新引入**账号 / 权限 / 跨账号视图。
3. **业务逻辑只在 `server/index.ts` 与 `routes/`。** `server/node.ts`（Web 宿主）和桌面 sidecar 只是宿主，不要在里面写业务。
4. **用户明确不想要产品级键盘快捷键。** `src/` 里不存在 Cmd/Ctrl+K。弹窗内部的 Escape / Tab 属于焦点管理，不算快捷键。

## 产品规则（每加一个功能都要过）

- **证据优先** — AI 研究判断必须持久化来源 / 位置 / 模型 / 时间，并显著展示来源。不能只给一个「听起来像模型」的结论。
- **对象优先** — Paper、Evidence、Gap、Idea、Experiment 是一等可链接对象，不是聊天附件。
- **用户可编辑** — AI 建议，用户拥有最终内容和确认状态。
- **无静默历史覆盖** — 重新生成、Idea 编辑、评审修订、LaTeX patch 都保留版本 / 快照历史。
- **锁定/确认的内容永不被批量 AI 静默覆盖** — `routes/matrix.ts` 的 PATCH 守卫。
- **外部输入不可信** — AI prompt 必须防注入；AI 输出必须过 `server/ai/capabilities.ts` 里的 Zod schema 才能落库。
- **Agent 写入受控** — 每轮最多一个白名单动作，只通过 `routes/` 处理器写入，全部记入 `ai_actions`。
- **成本可见** — 长 AI 任务显示范围、模型、进度、取消。
- **AI 与人工必须可区分** — AI 草稿用 `--draft` 琥珀色，已确认用 `--success` 绿色。
- **阅读器最小暴露** — 划词翻译 / 问答 / 双语对照只发送选中内容或当前页分段，**绝不发送整篇文档**。

## 状态机

- **Paper**：待读 → 粗读 → 精读 → 已复现 → 核心文献（归档已移除——「归档」就是删除）
- **Evidence**：`draft` / `confirmed` / `conflict` / `missing`
- **Idea**：Inbox → Draft → Reviewing → Revise → Approved → Experimenting → Writing → Archived

## 文档规则（强制）

任何**用户可见**的功能变更，必须在**同一个任务内**更新 [`README.md`](README.md)（英文，主），功能在中文 README 里有描述时同一轮也改 [`README.zh-CN.md`](README.zh-CN.md)，并在 [`CHANGELOG.md`](CHANGELOG.md) 追加条目。

README / CHANGELOG 编辑属于实现的一部分，不是收尾抛光。仅纯重构、以及对用户不可见的内部改动（测试、CI、开发工具）可以跳过。

## 交付前门禁

```bash
pnpm run typecheck
pnpm run test
pnpm run build
```

汇报时说明：改了哪些文件、迁移影响、测试结果、已知缺口——不要只说「做完了」。

## 两件容易踩的事

- **别把 `pnpm run test` 改回裸 `vitest`**，也别删 `pnpm-workspace.yaml` 的 `allowBuilds`。原因见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。
- **改 schema 后先判断迁移走哪条轨道**——`drizzle/`（0000–0007）还是 `scripts/migrate-custom.ts`（0007 之后）。同样见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

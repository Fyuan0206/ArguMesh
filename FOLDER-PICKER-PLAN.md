# 路线 A:原生文件夹选择器 — 实现方案

## 目标
在 ArguMesh 开源版实现「选本地文件夹 → 作为新项目导入」,复刻 DSH 的目录选择体验。

## 架构前提(已核实)
ArguMesh 与 DSH **同构** —— 都是「浏览器 SPA + Node/Hono 后端」:
- `server/node.ts` 托管 `dist/` + `/api`,和你一样
- 浏览器无法直接开系统对话框,但 **Node 后端可以 spawn 子进程调原生 API**
- DSH 正是靠后端子进程(Windows `IFileOpenDialog`/macOS `osascript`/Linux `zenity`)实现的
- ArguMesh 目前**无任何子进程基建、无桌面壳**,需从零加

## 核心流程
```
浏览器 "新建项目→选文件夹" → POST /api/system/pick-directory
   → Node spawn 子进程开原生文件夹对话框
   ← 返回 { path } / { cancelled } / { error }
→ addProject({ name, localPath }) → PUT 写入 projects.local_path
```

## 改动清单(7 处)

| # | 文件 | 改动 |
|---|---|---|
| 1 | `server/db/schema.ts` | `projects` 表加 `localPath: text("local_path")` |
| 2 | `server/services/native-picker.ts`(新) | 跨平台子进程选择器:Windows `IFileOpenDialog`/macOS `osascript`/Linux `zenity` |
| 3 | `server/routes/system.ts`(新) | `POST /system/pick-directory` 端点 |
| 4 | `server/index.ts` | 挂载 `systemRoutes` |
| 5 | `server/routes/library.ts` | `projectSchema` 加 `localPath`,insert 透传 |
| 6 | `src/state/workspace.tsx` | `LocalProject` 加 `localPath?`,`addProject`/merge 透传 |
| 7 | `src/pages/ProjectsPage.tsx` + `src/api.ts` | 新建表单加「选文件夹」按钮 + `pickDirectory()` helper |

## 工作量与风险

| 项 | 评估 |
|---|---|
| 跨平台子进程选择器 | **中高**。macOS/Linux 几行;Windows `IFileOpenDialog`(COM/koffi)是重头,或改用 PowerShell 降难度 |
| DB 迁移 + schema | 低,一个可选字段 |
| 前后端透传 + UI | 低,链路清晰 |
| 测试 | 中,子进程 mock 写 `tests/api/system.test.ts` |

**风险**:
1. Node v24 + koffi 的 Windows COM 需实测;不稳则回退 PowerShell `FolderBrowserDialog`
2. `localPath` 只记录创建时路径,不实时跟踪移动/重命名 —— UI 需标明
3. 开源单用户本地版,路径存本地库即可,无跨设备同步需求

## 落地顺序(建议)
1. schema + 迁移 + 后端创建接口透传(不依赖原生对话框,先让 localPath 能落地) ✅ `workspace_path` / Batch B `8769ba0`
2. native-picker + system 路由(先跑通 macOS/Linux,Windows 用 PowerShell 快速打通) ✅ `POST /api/system/pick-directory` + `open-path`
3. 前端 api helper + UI + 测试 ✅ ProjectsPage「选择文件夹」/「打开文件夹」

## 语义边界(Phase 2 冻结)
- **只登记路径**,不扫描、不导入目录内容;PDF 仍走 `paper_files` BLOB。
- 路径被移动/删除后记录保留,打开时 404 提示;不自动重选。
- 多项目可指向同一目录;不做目录独占锁。
- picker 请求体 `{}`;成功 `{ path }` / 取消 `{ cancelled:true }` / 失败 500。

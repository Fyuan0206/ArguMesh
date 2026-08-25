/**
 * 系统级能力:原生文件夹选择 / 在文件管理器中打开路径。
 * 仅本地 Node 宿主有意义;浏览器 SPA 通过这两个端点委托后端。
 */

import { access, constants, stat } from "node:fs/promises";
import { Hono } from "hono";
import { z } from "zod";
import { openNativePath, pickNativeDirectory } from "../services/native-picker";
import type { AppEnv } from "../types";

export const systemRoutes = new Hono<AppEnv>();

/** 同时只允许一个原生对话框,避免多标签页并发弹窗抢焦点。 */
let pickerBusy = false;

const openPathSchema = z.object({
  path: z.string().trim().min(1).max(1_000),
});

systemRoutes.post("/system/pick-directory", async (c) => {
  if (pickerBusy) {
    return c.json({ error: "PICKER_BUSY", message: "已有文件夹选择对话框在运行,请先完成或关闭它" }, 409);
  }
  pickerBusy = true;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  c.req.raw.signal.addEventListener("abort", onAbort);
  try {
    const path = await pickNativeDirectory(controller.signal);
    if (path === null) return c.json({ cancelled: true });
    return c.json({ path });
  } catch (error) {
    if (controller.signal.aborted || c.req.raw.signal.aborted) {
      return c.json({ cancelled: true });
    }
    const message = error instanceof Error ? error.message : "打开文件夹选择器失败";
    console.error("[system/pick-directory]", message);
    return c.json({ error: "PICKER_FAILED", message }, 500);
  } finally {
    c.req.raw.signal.removeEventListener("abort", onAbort);
    pickerBusy = false;
  }
});

systemRoutes.post("/system/open-path", async (c) => {
  const parsed = openPathSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: "INVALID_PATH", message: "需要提供 path 字符串" }, 400);
  }
  const target = parsed.data.path;
  try {
    await access(target, constants.F_OK);
    const info = await stat(target);
    if (!info.isDirectory() && !info.isFile()) {
      return c.json({ error: "PATH_NOT_FOUND", message: "路径不存在或不可访问" }, 404);
    }
  } catch {
    return c.json({ error: "PATH_NOT_FOUND", message: "路径不存在或不可访问" }, 404);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  c.req.raw.signal.addEventListener("abort", onAbort);
  try {
    await openNativePath(target, controller.signal);
    return c.json({ opened: true as const });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法在文件管理器中打开";
    console.error("[system/open-path]", message);
    return c.json({ error: "OPEN_FAILED", message }, 500);
  } finally {
    c.req.raw.signal.removeEventListener("abort", onAbort);
  }
});

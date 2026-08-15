import { defineConfig } from "vitest/config";

/**
 * 单套 Vitest 配置:
 *  - tests/unit/** 默认 happy-dom 环境(前端模块依赖 window/sessionStorage);
 *  - tests/api/** 用文件头 `// @vitest-environment node` 声明 Node 环境
 *    (直连 Hono app,配合临时 SQLite 文件库跑真实 API 流程)。
 */
export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "tests/api/**/*.test.ts"],
    reporters: ["default"],
    pool: "threads",
  },
});

import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "turso", // libSQL 方言:同时兼容本地 file: 与远程 libsql://
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/argumesh.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});

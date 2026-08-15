import "dotenv/config";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { mkdirSync } from "node:fs";

const url = process.env.DATABASE_URL ?? "file:./data/argumesh.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;
// 本地文件库:确保 data/ 目录存在(libsql 不会自动建目录)。
mkdirSync("data", { recursive: true });

const client = createClient({ url, authToken });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "drizzle" });
console.log("Applied Drizzle migrations.");
client.close();

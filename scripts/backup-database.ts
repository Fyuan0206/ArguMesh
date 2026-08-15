import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL ?? "file:./data/argumesh.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const client = createClient({ url, authToken });

try {
  const tableResult = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const tableNames = tableResult.rows.map((row) => String(row.name));
  const tables: Record<string, unknown[]> = {};

  for (const tableName of tableNames) {
    const quotedName = `"${tableName.replaceAll('"', '""')}"`;
    const result = await client.execute(`SELECT * FROM ${quotedName}`);
    tables[tableName] = result.rows.map((row) => ({ ...row }));
  }

  const timestamp = new Date().toISOString().replaceAll(":", "-").replace(".", "-");
  const backupDirectory = resolve("backups");
  const backupPath = resolve(backupDirectory, `argumesh-${timestamp}.json`);
  await mkdir(backupDirectory, { recursive: true });
  await writeFile(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), tables }, null, 2), "utf8");
  console.log(`Database backup written to ${backupPath}`);
  console.log(`Backed up ${tableNames.length} tables and ${Object.values(tables).reduce((total, rows) => total + rows.length, 0)} rows.`);
} finally {
  client.close();
}

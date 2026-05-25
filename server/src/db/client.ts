import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dataDir = join(__dirname, "../../data");
mkdirSync(dataDir, { recursive: true });

const dbPath = join(dataDir, "study.sqlite");
export const db = new Database(dbPath);

const schemaPath = existsSync(join(__dirname, "schema.sql"))
  ? join(__dirname, "schema.sql")
  : join(__dirname, "../../src/db/schema.sql");
const schemaSql = readFileSync(schemaPath, "utf8");
db.exec(schemaSql);

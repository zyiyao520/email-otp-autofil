import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Pool } from "pg";

import { DATA_DIR } from "../constants.js";

export const DATABASE_URL = process.env.DATABASE_URL?.trim() || "";
export const DB_BACKEND = DATABASE_URL ? "postgres" : "sqlite";

let sqlite: DatabaseSync | null = null;
let pool: Pool | null = null;

function pgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function dbQuery<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  if (pool) return (await pool.query(pgSql(sql), params)).rows as T[];
  if (!sqlite) throw new Error("database_not_initialized");
  return sqlite.prepare(sql).all(...params.map((v) => typeof v === "boolean" ? (v ? 1 : 0) : v)) as T[];
}

export async function dbGet<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params: any[] = [],
): Promise<T | null> {
  if (pool) return ((await pool.query(pgSql(sql), params)).rows[0] as T | undefined) ?? null;
  if (!sqlite) throw new Error("database_not_initialized");
  return (sqlite.prepare(sql).get(...params.map((v) => typeof v === "boolean" ? (v ? 1 : 0) : v)) as T | undefined) ?? null;
}

export async function dbRun(sql: string, params: any[] = []): Promise<number> {
  if (pool) return (await pool.query(pgSql(sql), params)).rowCount ?? 0;
  if (!sqlite) throw new Error("database_not_initialized");
  return Number(sqlite.prepare(sql).run(...params.map((v) => typeof v === "boolean" ? (v ? 1 : 0) : v)).changes);
}

export async function initializeDatabase(): Promise<void> {
  if (DATABASE_URL) {
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: Math.max(1, Number(process.env.DB_POOL_MAX || 3)),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });
    await pool.query("SELECT 1");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        created_at BIGINT NOT NULL, invite_code TEXT, last_seen BIGINT, disabled BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS configs (user_id TEXT PRIMARY KEY, json JSONB NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS invites (
        code TEXT PRIMARY KEY, created_at BIGINT NOT NULL, used_by TEXT, used_at BIGINT, note TEXT
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
    `);
    console.log("[otp-agent] database backend: PostgreSQL");
    return;
  }

  mkdirSync(DATA_DIR, { recursive: true });
  sqlite = new DatabaseSync(path.join(DATA_DIR, "agent.db"));
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL, invite_code TEXT, last_seen INTEGER, disabled INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS configs (user_id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, created_at INTEGER NOT NULL, used_by TEXT, used_at INTEGER, note TEXT);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);
  const sessionColumns = sqlite.prepare("PRAGMA table_info(sessions)").all() as Array<{ name: string }>;
  if (!sessionColumns.some((column) => column.name === "token_hash")) {
    sqlite.exec(`
      DROP TABLE IF EXISTS sessions;
      CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX idx_sessions_user ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);
    `);
    console.warn("[otp-agent] legacy sessions invalidated during secure token-hash migration");
  }
  console.log("[otp-agent] database backend: SQLite");
}

export async function databaseHealth(): Promise<boolean> {
  try { await dbGet("SELECT 1 AS ok"); return true; } catch { return false; }
}

export async function closeDatabase(): Promise<void> {
  if (pool) await pool.end();
  pool = null;
  sqlite?.close();
  sqlite = null;
}

import { z } from "zod";

import { LOCAL_USER_ID } from "../http/auth.js";
import { dbGet, dbRun } from "./db.js";

const AccountSchema = z.object({
  email: z.string().email(),
});

const ImapAccountSchema = z.object({
  email: z.string().email(),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535).default(993),
  secure: z.boolean().default(true),
  username: z.string().min(1),
});

const ConfigSchema = z.object({
  pollIntervalMs: z.number().int().min(1000).max(60000).default(5000),
  includeSpam: z.boolean().default(false),
  qq: z
    .object({
      // Multi-account: each QQ mailbox is one entry. The auth code lives in the
      // secret store under `qq:${email}` (see ProviderManager).
      // Reason: factory defaults — a literal default object is shared across all
      // zod parses, so two users' configs would alias the same array.
      accounts: z.array(AccountSchema).default(() => []),
    })
    .default(() => ({ accounts: [] })),
  imap: z
    .object({ accounts: z.array(ImapAccountSchema).default(() => []) })
    .default(() => ({ accounts: [] })),
  outlook: z
    .object({
      mode: z.literal("oauth").default("oauth"),
    })
    .default(() => ({ mode: "oauth" as const })),
  gmail: z
    .object({
      mode: z.literal("oauth").default("oauth"),
      pubsubEnabled: z.boolean().default(false),
      topicName: z.string().optional(),
    })
    .default(() => ({ mode: "oauth" as const, pubsubEnabled: false })),
});

export type AppConfig = z.infer<typeof ConfigSchema>;
export type Account = z.infer<typeof AccountSchema>;

// Legacy single-account shape (pre multi-account). Used only for migration.
type LegacyShape = {
  qq?: { email?: string; accounts?: unknown };
  outlook?: { mode?: string; imapEmail?: string; imapAccounts?: unknown; clientId?: unknown };
  gmail?: { mode?: string };
};

// Migrate old config shapes and remove retired Outlook IMAP fields. Returns true
// if anything changed, so the caller can persist the upgraded config back to DB.
function migrateLegacy(raw: any): boolean {
  if (!raw || typeof raw !== "object") return false;
  let changed = false;
  const legacy = raw as LegacyShape;

  if (legacy.qq && typeof legacy.qq.email === "string" && !Array.isArray(legacy.qq.accounts)) {
    raw.qq.accounts = [{ email: legacy.qq.email }];
    delete raw.qq.email;
    changed = true;
  }

  if (legacy.outlook && typeof legacy.outlook === "object") {
    if (legacy.outlook.mode !== "oauth") {
      raw.outlook.mode = "oauth";
      changed = true;
    }
    if ("imapEmail" in legacy.outlook) {
      delete raw.outlook.imapEmail;
      changed = true;
    }
    if ("imapAccounts" in legacy.outlook) {
      delete raw.outlook.imapAccounts;
      changed = true;
    }
    if ("clientId" in legacy.outlook) {
      delete raw.outlook.clientId;
      changed = true;
    }
  }
  return changed;
}

// Per-user config is stored as a JSON document in the `configs` table, keyed by
// userId ("local" for the single-tenant instance).
export async function loadConfig(userId: string = LOCAL_USER_ID): Promise<AppConfig> {
  const row = await dbGet<{ json: string | object }>("SELECT json FROM configs WHERE user_id = ?", [userId]);
  if (!row) return ConfigSchema.parse({});
  try { const raw = typeof row.json === "string" ? JSON.parse(row.json) : row.json; const migrated=migrateLegacy(raw); const cfg=ConfigSchema.parse(raw); if(migrated) await saveConfig(cfg,userId); return cfg; } catch { return ConfigSchema.parse({}); }
}
export async function saveConfig(cfg: AppConfig, userId: string = LOCAL_USER_ID): Promise<void> {
  await dbRun("INSERT INTO configs (user_id,json) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json", [userId, JSON.stringify(cfg)]);
}

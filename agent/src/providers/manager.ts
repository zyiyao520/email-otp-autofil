import { ImapOtpWatcher } from "./imap.js";
import { OutlookOAuthProvider } from "./outlook-oauth.js";
import { GmailOAuthProvider } from "./gmail-oauth.js";
import type { OtpStore } from "../otp/store.js";
import type { AppConfig } from "../storage/config.js";
import { loadConfig, saveConfig } from "../storage/config.js";
import { secretDelete, secretGet } from "../storage/secrets.js";
import { LOCAL_USER_ID, scopedKey } from "../http/auth.js";

type Watcher = { watcher: ImapOtpWatcher; task: Promise<void>; includeSpam: boolean; pollIntervalMs: number };

export class ProviderManager {
  private store: OtpStore;
  private userId: string;
  config: AppConfig;

  // Multi-account: one IMAP watcher per mailbox, keyed by email.
  private qq = new Map<string, Watcher>();
  private imap = new Map<string, Watcher>();
  private outlookOAuth: OutlookOAuthProvider; // single-account per user
  private gmailOAuth: GmailOAuthProvider; // single-account per user

  constructor(store: OtpStore, config: AppConfig, userId: string = LOCAL_USER_ID) {
    this.store = store;
    this.userId = userId;
    this.config = config;
    this.outlookOAuth = new OutlookOAuthProvider(store, userId);
    this.gmailOAuth = new GmailOAuthProvider(store, userId);
  }

  private kcQq(email: string) {
    return scopedKey(this.userId, `qq:${email}`);
  }
  private kcImap(email: string) {
    return scopedKey(this.userId, `imap:${email}`);
  }

  static async create(store: OtpStore, userId: string = LOCAL_USER_ID): Promise<ProviderManager> {
    const cfg = await loadConfig(userId);
    return new ProviderManager(store, cfg, userId);
  }

  getOutlookOAuth() {
    return this.outlookOAuth;
  }

  getGmailOAuth() {
    return this.gmailOAuth;
  }

  async reloadConfig(): Promise<void> {
    this.config = await loadConfig(this.userId);
    await this.reconcile();
  }

  async updateConfig(mut: (cfg: AppConfig) => void): Promise<void> {
    const cfg = await loadConfig(this.userId);
    mut(cfg);
    await saveConfig(cfg, this.userId);
    await this.reloadConfig();
  }

  async reconcile(): Promise<void> {
    await this.reconcileQq();
    await this.reconcileImap();
    // OAuth pollers are cheap; they exit early if not connected.
    this.outlookOAuth.startPolling(this.config.pollIntervalMs, this.config.includeSpam);

    // Gmail: prefer Pub/Sub push, fall back to polling.
    const gmailOAuth = this.gmailOAuth;
    // Must be set before loadPubSubState/renewWatchIfNeeded: in Pub/Sub mode
    // startPolling() never runs, but the watch registration needs the flag to
    // decide whether to subscribe to the SPAM label.
    gmailOAuth.setIncludeSpam(this.config.includeSpam);
    await gmailOAuth.loadPubSubState();

    if (this.config.gmail.pubsubEnabled && this.config.gmail.topicName) {
      // Pub/Sub mode: renew watch only if it was previously active.
      // First-time watch registration must be done via /v1/gmail/pubsub/start.
      const pubsubStatus = gmailOAuth.pubsubStatus();
      if (pubsubStatus.expiration > 0) {
        await gmailOAuth.renewWatchIfNeeded(this.config.gmail.topicName);
      }
      const updatedStatus = gmailOAuth.pubsubStatus();
      if (updatedStatus.active) {
        gmailOAuth.stop();
      } else {
        gmailOAuth.stop();
        console.warn("[otp-agent] gmail pubsub watch inactive, not polling to preserve quota");
      }
    } else {
      // Pub/Sub not configured — use polling.
      gmailOAuth.startPolling(this.config.pollIntervalMs);
    }
  }

  // Stop all watchers for this user (used when removing a user / shutting down).
  stopAll(): void {
    for (const [, w] of this.qq) w.watcher.stop();
    this.qq.clear();
    for (const [, w] of this.imap) w.watcher.stop();
    this.imap.clear();
    this.outlookOAuth.stop();
    this.gmailOAuth.stop();
  }

  // Diff the configured QQ accounts against running watchers: stop removed ones,
  // start newly-added ones (only when their secret is present), keep the rest.
  private async reconcileQq(): Promise<void> {
    const wanted = new Set(this.config.qq.accounts.map((a) => a.email));

    for (const [email, w] of this.qq) {
      if (!wanted.has(email)) {
        w.watcher.stop();
        this.qq.delete(email);
      }
    }

    for (const { email } of this.config.qq.accounts) {
      const existing = this.qq.get(email);
      if (existing) {
        if (existing.includeSpam === this.config.includeSpam && existing.pollIntervalMs === this.config.pollIntervalMs) {
          continue;
        }
        existing.watcher.stop();
        this.qq.delete(email);
      }
      const pass = await secretGet(this.kcQq(email));
      if (!pass) continue; // configured but no secret yet — skip until set
      const watcher = new ImapOtpWatcher({
        providerId: "qq",
        userId: this.userId,
        host: "imap.qq.com",
        port: 993,
        secure: true,
        auth: { user: email, pass },
        store: this.store,
        pollIntervalMs: this.config.pollIntervalMs,
        includeSpam: this.config.includeSpam,
      });
      // Reason: a bad credential makes start() reject; swallow it so one broken
      // account never crashes the agent (critical in multi-tenant).
      const task = watcher.start().catch((e) => {
        console.error(`[otp-agent] qq watcher failed for ${email}: ${String((e as any)?.message || e)}`);
      });
      this.qq.set(email, {
        watcher,
        task,
        includeSpam: this.config.includeSpam,
        pollIntervalMs: this.config.pollIntervalMs,
      });
    }
  }

  private async reconcileImap(): Promise<void> {
    const wanted = new Set(this.config.imap.accounts.map((a) => a.email));
    for (const [email, w] of this.imap) {
      if (!wanted.has(email)) { w.watcher.stop(); this.imap.delete(email); }
    }
    for (const account of this.config.imap.accounts) {
      const existing = this.imap.get(account.email);
      if (existing && existing.includeSpam === this.config.includeSpam && existing.pollIntervalMs === this.config.pollIntervalMs) continue;
      if (existing) { existing.watcher.stop(); this.imap.delete(account.email); }
      const pass = await secretGet(this.kcImap(account.email));
      if (!pass) continue;
      const watcher = new ImapOtpWatcher({
        providerId: "imap", userId: this.userId, host: account.host, port: account.port,
        secure: account.secure, auth: { user: account.username, pass }, store: this.store,
        pollIntervalMs: this.config.pollIntervalMs, includeSpam: this.config.includeSpam,
      });
      const task = watcher.start().catch((e) => console.error(`[otp-agent] imap watcher failed for ${account.email}: ${String((e as any)?.message || e)}`));
      this.imap.set(account.email, { watcher, task, includeSpam: this.config.includeSpam, pollIntervalMs: this.config.pollIntervalMs });
    }
  }

  // --- account add/remove -------------------------------------------------

  async addQqAccount(email: string): Promise<void> {
    await this.updateConfig((c) => {
      if (!c.qq.accounts.some((a) => a.email === email)) c.qq.accounts.push({ email });
    });
  }

  async removeQqAccount(email: string): Promise<void> {
    await secretDelete(this.kcQq(email));
    await this.updateConfig((c) => {
      c.qq.accounts = c.qq.accounts.filter((a) => a.email !== email);
    });
  }

  async clearQq(): Promise<void> {
    for (const { email } of this.config.qq.accounts) await secretDelete(this.kcQq(email));
    await this.updateConfig((c) => {
      c.qq.accounts = [];
    });
  }

  async addImapAccount(account: { email: string; host: string; port: number; secure: boolean; username: string }): Promise<void> {
    await this.updateConfig((c) => {
      c.imap.accounts = c.imap.accounts.filter((a) => a.email !== account.email);
      c.imap.accounts.push(account);
    });
  }
  async removeImapAccount(email: string): Promise<void> {
    await secretDelete(this.kcImap(email));
    await this.updateConfig((c) => { c.imap.accounts = c.imap.accounts.filter((a) => a.email !== email); });
  }
  secretKeyFor(kind: "qq" | "imap", email: string): string {
    return kind === "qq" ? this.kcQq(email) : this.kcImap(email);
  }
}

// Registry of per-user ProviderManagers over a shared OtpStore (items are
// tagged by userId). Single-tenant mode uses just the "local" manager.
export class ProviderRegistry {
  private store: OtpStore;
  private managers = new Map<string, ProviderManager>();

  constructor(store: OtpStore) {
    this.store = store;
  }

  async getOrCreate(userId: string): Promise<ProviderManager> {
    const existing = this.managers.get(userId);
    if (existing) return existing;
    const mgr = await ProviderManager.create(this.store, userId);
    this.managers.set(userId, mgr);
    await mgr.reconcile();
    return mgr;
  }

  get(userId: string): ProviderManager | undefined {
    return this.managers.get(userId);
  }

  // Boot watchers for a set of users (e.g. all registered users on startup).
  async bootstrap(userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.getOrCreate(userId);
    }
  }

  async removeUser(userId: string): Promise<void> {
    const mgr = this.managers.get(userId);
    if (mgr) {
      mgr.stopAll();
      this.managers.delete(userId);
    }
  }
}

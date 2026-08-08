# Email OTP Autofill

**English** | [中文](README.zh-CN.md)

Read one-time passwords (OTPs) and verification links from QQ Mail, Outlook,
Gmail, and generic IMAP mailboxes. A local or remotely deployed **agent** works
with a Chrome Manifest V3 **extension** to provide context-aware autofill,
verification-link prompts, and registration-email selection.

> Storage supports local SQLite or PostgreSQL/Neon through one complete `DATABASE_URL=postgresql://...` value.

## How it works

The Chrome extension connects to an **agent** service. The agent reads recent
mail through IMAP, Microsoft Graph OAuth, or Gmail OAuth and extracts OTPs and
high-confidence HTTPS verification links. The extension recognizes OTP fields,
check-email pages, and registration email fields, then fills or prompts according
to the current page context.

For Gmail, the agent supports **Google Cloud Pub/Sub push notifications** —
when a new email arrives, Google pushes a notification to the agent in
real-time, eliminating polling delays and reducing API quota usage.

| Popup | Settings |
| --- | --- |
| ![Extension popup showing a fetched OTP](docs/screenshots/popup.png) | ![Extension settings with agent status and mailbox accounts](docs/screenshots/settings.png) |

Two ways to connect:

- **Public instance (zero setup)** — the extension ships pointing at
  `https://otp.razet.me`. Register an account and go; no server of your own.
- **Self-host** — run your own multi-tenant agent with Docker (one Docker
  Compose command).

## Components

- `agent/`: Node.js 24 / TypeScript HTTP service that connects to mailboxes,
  extracts OTPs and verification links, encrypts credentials, and persists state
  in PostgreSQL/Neon or local SQLite. It supports a platform-provided `PORT`.
- `chrome-extension/`: Chrome MV3 extension with automatic OTP filling,
  verification-link prompts, registration-email selection, popup/settings UI,
  account login, and English/Chinese localization.

## Features

- **Mailboxes**: QQ Mail, Outlook OAuth, Gmail OAuth, and generic IMAP with an app password.
- **Gmail Pub/Sub push**: real-time OTP delivery via Google Cloud Pub/Sub —
  zero polling delay, lower API quota usage. Falls back to polling if Pub/Sub
  is not configured.
- **OTP extraction**: keyword + scoring match for 4–8 digit codes (中/English
  keywords), with automatic validity-window detection (10s–24h).
- **Hotkey autofill**: `⌘/Ctrl + Shift + .` finds the OTP input and fills it; a
  red toolbar badge signals a fresh code (checked ~every 30s).
- **Credential encryption**: AES-256-GCM (key derived from a master key via
  scrypt); the master key lives only in the environment and is never written to
  disk.
- **Multi-tenant**: mailboxes, OTPs, and credentials are isolated per account.
  Sessions last 30 days and only SHA-256 session-token hashes are persisted.
- **Admin panel**: `/admin` (token-gated) — user/mailbox stats, invite-code
  management, optional "invite required" registration, enable/disable users.
- **Bilingual UI**: 中 / English, switchable at runtime.

## Status

The current release supports QQ and generic IMAP, Outlook OAuth, Gmail OAuth and
Pub/Sub, automatic OTP filling, verification-link prompts, registration mailbox
selection, encrypted credentials, and PostgreSQL/Neon or SQLite persistence.
The agent supports Docker deployment to a VPS or a container platform such as Shiper.

## Load the extension

Chrome → `chrome://extensions` → enable Developer Mode → **Load unpacked** →
select the `chrome-extension/` folder.

## Usage

### 0. Log in

In the Settings page, **register or log in** at the top "account" area; once
signed in the extension attaches your session credentials when talking to the
agent. (If the instance has invite-only signup enabled, enter the invite code
issued by the admin when registering.)

### 1. Configure a mailbox (in the extension's Settings)

Click the extension icon → `Settings`. Confirm the `Agent` status at the top is
**OK**.

> As in the **Settings screenshot**: the left "mailbox accounts" column lists
> connected accounts (green dot = online); the right "Agent" panel shows the
> connection address and status, and lets you set the OTP "validity (seconds)".
> Click "Add account" to configure a new mailbox.

- **QQ Mail (IMAP)**: log in to [QQ Mail web](https://mail.qq.com) → Settings →
  Account → enable "IMAP/SMTP service" → complete the SMS verification → obtain
  an **auth code** (not your login password). Enter the QQ address and auth code
  in Settings → `Save QQ`.
- **Outlook (OAuth, recommended)**: in the
  [Azure portal · App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
  create a new registration (account type "Personal Microsoft accounts only") →
  Authentication → Add a platform → Mobile and desktop applications → select or
  enter `https://login.microsoftonline.com/common/oauth2/nativeclient` → set
  "Allow public client flows" to Yes → copy the Application (client) ID and paste
  it in → `Save Client ID` → `Start login`, follow the device-code prompt to
  authorize in your browser → `Poll` to confirm the connection.
- **Gmail (OAuth)**: in the
  [Google Cloud Console · Credentials](https://console.cloud.google.com/apis/credentials)
  create an OAuth 2.0 Client ID (type "Web application") → note the Client ID
  and Client Secret → paste them in the extension's Gmail settings → `Start
  Sign-in`, authorize in your browser → the connection is established
  automatically.

  **Optional: Pub/Sub push (recommended for production)** — for real-time OTP
  delivery without polling:
  1. In [Google Cloud Console · Pub/Sub](https://console.cloud.google.com/cloudpubsub),
     create a topic (e.g. `gmail-notifications`) and a push subscription
     pointing to `https://your.domain/v1/gmail/pubsub`.
  2. In the subscription's push settings, set the **audience** to your agent's
     pubsub endpoint URL.
  3. In the agent's admin panel (`/admin`), set the Google OAuth credentials
     and Pub/Sub audience, then configure the topic name in the user's Gmail
     settings.
  4. The agent will automatically register a Gmail watch (7-day expiration,
     auto-renewed) and process incoming push notifications.

> A saved auth code/password is masked with dots (••••) the next time you open
> Settings; click the **eye** icon at the right of the field to reveal it.

### 2. Everyday use

1. Click "Send code" on the web page. When the email arrives, the extension's
   toolbar icon shows a **red badge** indicating a fresh code (checked ~every
   30s).
2. **Click into the page's OTP input**, then press the hotkey to fill:
   - macOS: `⌘ + Shift + .`
   - Windows/Linux: `Ctrl + Shift + .`

   (The shortcut can be changed at `chrome://extensions/shortcuts`.)
3. Or click the extension icon and, once the code is shown in the popup, click
   `Fill` / `Copy`.

> As in the **Popup screenshot**: the top of the popup shows the source mailbox
> (e.g. `Outlook`) and the code; the line below gives "arrival time · sender
> address · time remaining". If multiple valid codes exist at once, page through
> them with `‹ ›` (`1 / 2`); the progress bar shows the current code's remaining
> validity. `Agent: OK` at the bottom means the connection to the agent is
> healthy.

The badge clears automatically after filling; by default a code is only valid
for **120 seconds** after arrival (adjustable to 10–600s under Settings → "OTP
validity").

### 3. Interface language

The popup and Settings page have a **中 / English toggle** at the top-right; it
follows your browser language on first run, then remembers your choice.

## Self-host the agent (Docker)

```bash
git clone https://github.com/zyiyao520/email-otp-autofil.git
cd email-otp-autofil
cp .env.example .env
```

Set two secrets in `.env` (users register/log in with their own accounts; their
data is isolated — there is no shared API key to hand out):

```bash
OTP_AGENT_MASTER_KEY=$(openssl rand -base64 32)   # at-rest encryption (required)
OTP_ADMIN_TOKEN=$(openssl rand -base64 24)        # for the /admin panel
```

Start it:

```bash
docker compose up -d --build
```

- **Users**: register / log in from the extension's Settings, then point
  **Agent Base URL** at your address.
- **You (admin)**: open `https://your.domain.tld/admin`, sign in with the admin
  token to manage invite codes, users, and view stats. Toggle "invite required"
  there if you want closed signup.

### Exposing it publicly

The agent binds to `127.0.0.1:17373` on the server. How you expose it to the
internet is **your server's concern, not this project's** — point your existing
reverse proxy or tunnel at `127.0.0.1:17373`. Common options:

- **Cloudflare Tunnel** — run a `cloudflared` connector (separately from this
  project) with an ingress rule routing `your.domain.tld → http://127.0.0.1:17373`.
- **Reverse proxy** (nginx / Caddy) terminating TLS in front of `127.0.0.1:17373`.
- **SSH port-forward** for quick testing:

  ```bash
  ssh -N -L 17373:127.0.0.1:17373 root@YOUR_SERVER_IP
  ```

Then set the extension's **Agent Base URL** to your public address.

> ⚠️ **Keep `OTP_AGENT_MASTER_KEY` safe and stable.** It decrypts your stored
> email credentials. Lose it and every mailbox must be re-entered; change it and
> previously stored secrets can no longer be decrypted. It is never written to
> disk.

## Database and secret storage

Set one complete `DATABASE_URL=postgresql://...` value to use PostgreSQL/Neon.
When it is absent, the agent uses local SQLite at `data/agent.db`.

Mailbox credentials are encrypted with **AES-256-GCM** before storage. The key
is derived from `OTP_AGENT_MASTER_KEY` with scrypt and is never written to the
database. Raw session Bearer tokens are also never stored; only SHA-256 hashes
are persisted.

Keep `OTP_AGENT_MASTER_KEY` stable. Losing or changing it makes existing mailbox
credentials unrecoverable. Running without it is intended only for disposable
local testing.

## Shiper + Neon deployment

For production on Shiper, configure the project with `agent` as the base path and `Dockerfile` as the deployment file. Set a pooled PostgreSQL URL directly:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.neon.tech/neondb?sslmode=require
OTP_AGENT_MASTER_KEY=<stable random master key>
```

Optional settings:

```env
OTP_ADMIN_TOKEN=<independent admin token>
NODE_OPTIONS=--max-old-space-size=128
DB_POOL_MAX=3
```

The agent automatically uses Shiper's `PORT`, initializes the PostgreSQL schema, and exposes `/health`. See [`docs/deploy-shiper-neon.md`](docs/deploy-shiper-neon.md).

## Admin API (multi-tenant)

Token-gated by `OTP_ADMIN_TOKEN` (send as a Bearer token). Highlights:

- `GET /v1/admin/stats` — user counts, recent activity, invite usage.
- `GET/POST /v1/admin/invites`, `POST /v1/admin/invites/revoke` — manage invite
  codes.
- `POST /v1/admin/settings` — toggle invite-required registration.
- `GET /v1/admin/users`, `POST /v1/admin/users/disable` — list / enable /
  disable users.

A browser UI for the same lives at `/admin`.

## Community
This open-source project is linked and endorsed by the [LINUX DO](https://linux.do/).

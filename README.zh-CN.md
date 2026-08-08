# 邮箱验证码自动填充

[English](README.md) | **中文**

从 QQ 邮箱、Outlook、Gmail 及通用 IMAP 邮箱读取一次性验证码（OTP）和邮箱验证链接，
通过一个本地或远端部署的 **Agent** 与 Chrome Manifest V3 **扩展**，完成验证码自动填充、
验证链接主动提示和注册邮箱候选选择。

> 当前版本支持本地 SQLite，也支持通过一条 `postgresql://...` 的 `DATABASE_URL` 使用 Neon 或其他 PostgreSQL 服务。

## 工作原理

Chrome 扩展连接一个 **Agent** 服务。Agent 通过 IMAP、Microsoft Graph OAuth 或 Gmail OAuth
读取近期邮件，提取验证码和高置信度 HTTPS 验证链接。扩展会识别验证码输入框、检查邮箱页面
及注册邮箱字段，并按场景自动填充或显示需要用户确认的提示。

对于 Gmail，agent 支持 **Google Cloud Pub/Sub 推送通知**——当新邮件到达时，Google
会实时推送到 agent，消除轮询延迟并减少 API 配额消耗。

| 验证码弹窗（Popup） | 设置（Settings） |
| --- | --- |
| ![扩展弹窗显示抓取到的验证码](docs/screenshots/popup.png) | ![扩展设置页：agent 状态与邮箱账号](docs/screenshots/settings.png) |

两种连接方式：

- **公共实例（零配置）**——扩展默认指向 `https://otp.razet.me`。注册账号即可使用，
  无需自建服务器。
- **自部署**——用 Docker 跑你自己的多租户 agent（一条 Docker Compose 命令）。

## 组成部分

- `agent/`：Node.js 24 / TypeScript HTTP 服务，负责连接邮箱、提取验证码和验证链接、
  加密存储凭据，并通过 PostgreSQL/Neon 或本地 SQLite 持久化状态。默认本地监听
  `127.0.0.1:17373`，平台部署时支持读取 `PORT`。
- `chrome-extension/`：Chrome MV3 扩展（快捷键填充、弹窗、设置 / 引导 UI、账号登录、
  中 / EN 双语）。

## 0.3.0 验证链接与注册邮箱助手

- **验证链接主动提示**：识别“检查邮箱/确认邮件”页面，快速查询新邮件中的 HTTPS 验证链接，并在页面显示“安全打开/复制链接”提示卡。
- **安全链接筛选**：验证上下文和 URL 路径双重评分，排除退订、隐私、帮助、追踪像素及非 HTTPS 链接；链接打开后不再重复提示。
- **注册邮箱选择器**：在注册/创建账号页面聚焦邮箱字段时，自动读取当前用户已连接的 QQ、Outlook、Gmail 和通用 IMAP 邮箱，展示就地备选列表并一键填入。
- **避免登录页误填**：注册语义评分会排除仅包含“登录/Sign in”的邮箱字段，不自动提交表单。

## 0.2.0 优化版

- **更少配置**：自部署仍只需两个服务端密钥；邮箱连接集中在扩展设置页完成。
- **场景化自动填充**：识别验证码输入框、动态 SPA 页面以及“发送/重新发送验证码”操作，在 90 秒窗口内快速获取并自动填充。
- **更广邮箱兼容**：保留 QQ、Outlook、Gmail，并新增通用 IMAP Agent API，可接入支持 IMAP 和应用专用密码的邮箱。
- **稳健填充**：支持 React/Vue 受控输入框、单框验证码和 4–10 位分格验证码；自动填充前校验长度和邮件到达时间。

详细变更和通用 IMAP API 见 [`OPTIMIZATION.md`](OPTIMIZATION.md)。

## 功能特性

- **邮箱**：QQ 邮箱、Outlook OAuth、Gmail OAuth，以及使用应用专用密码的通用 IMAP 邮箱。
- **Gmail Pub/Sub 推送**：通过 Google Cloud Pub/Sub 实时获取验证码——零轮询延迟，更低 API 配额消耗。未配置 Pub/Sub 时自动回退到轮询模式。
- **验证码提取**：关键词 + 打分匹配 4–8 位验证码（中 / 英文关键词），自动识别有效期
  窗口（10 秒–24 小时）。
- **快捷键填充**：`⌘/Ctrl + Shift + .` 定位验证码输入框并填充；工具栏红色角标提示有
  新验证码（约每 30 秒检查一次）。
- **凭据加密**：AES-256-GCM（密钥由主密钥经 scrypt 派生）；主密钥仅存在于环境变量
  中，永不落盘。
- **多租户**：用户注册并登录；每个账号的邮箱、验证码和凭据相互隔离。会话有效期为 30 天，
  数据可持久化到 PostgreSQL/Neon 或本地 SQLite，数据库中只保存 Session Token 的 SHA-256 哈希。
- **管理后台**：`/admin`（token 鉴权）——用户 / 邮箱统计、邀请码管理、可选「需邀请码
  注册」、启用 / 停用用户。
- **双语 UI**：中 / English，运行时可切换。

## 当前状态

当前版本已支持 QQ IMAP、通用 IMAP、Outlook OAuth、Gmail OAuth/Pub/Sub、验证码自动填充、
验证链接主动提示、注册邮箱选择、多租户隔离、AES-256-GCM 凭据加密，以及 PostgreSQL/Neon
和 SQLite 双存储后端。Agent 可通过 Docker 部署到 VPS 或 Shiper 等容器平台。

## 加载扩展

Chrome → `chrome://extensions` → 开启开发者模式 → **加载已解压的扩展程序** → 选择
`chrome-extension/` 文件夹。

## 使用方法

### 0. 登录

设置页顶部「账号」区**注册或登录**；成功后扩展会带上你的会话凭据访问 agent。
（若实例开启了「邀请码注册」，注册时需填管理员发放的邀请码。）

### 1. 配置邮箱（在扩展的「设置」页）

点击扩展图标 → `设置`（Settings）。顶部确认 `Agent` 状态为 **正常 / OK**。

> 如上方 **Settings 截图**：左侧「邮箱账号」列出已连接的账号（绿点 = 在线），右侧
> 「Agent」区显示连接地址与状态，并可设置「验证码有效期（秒）」。点「添加账号」配置
> 新邮箱。

- **QQ 邮箱（IMAP）**：登录 [QQ 邮箱网页版](https://mail.qq.com) → 设置 → 账号 → 开启「IMAP/SMTP 服务」→ 按提示短信验证 → 得到 **授权码**（不是登录密码）。把 QQ 邮箱和授权码填入设置页 → `保存 QQ`。
- **Outlook（OAuth，推荐）**：在 [Azure 门户 · 应用注册](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade) 新建注册（账户类型选「Personal Microsoft accounts only」）→ Authentication → Add a platform → Mobile and desktop applications → 选择或填写 `https://login.microsoftonline.com/common/oauth2/nativeclient` → 将「Allow public client flows」设为 Yes → 复制 Application (client) ID 填入 → `保存 Client ID` → `开始登录`，按设备码提示在浏览器完成授权 → `轮询` 确认连接。
- **Gmail（OAuth）**：在 [Google Cloud Console · Credentials](https://console.cloud.google.com/apis/credentials) 创建 OAuth 2.0 客户端 ID（类型选「Web 应用」）→ 记下 Client ID 和 Client Secret → 填入扩展的 Gmail 设置 → `开始登录`，在浏览器完成授权 → 连接自动建立。

  **可选：Pub/Sub 推送（生产环境推荐）**——实现零轮询实时获取验证码：
  1. 在 [Google Cloud Console · Pub/Sub](https://console.cloud.google.com/cloudpubsub)
     创建一个主题（如 `gmail-notifications`）和一个推送订阅，推送地址设为
     `https://your.domain/v1/gmail/pubsub`。
  2. 在订阅的推送设置中，将**受众（audience）**设为 agent 的 pubsub 端点 URL。
  3. 在 agent 管理后台（`/admin`）设置 Google OAuth 凭据和 Pub/Sub 受众，然后在用户的
     Gmail 设置中配置主题名称。
  4. agent 会自动注册 Gmail watch（7 天有效期，自动续期）并处理收到的推送通知。

> 已保存的授权码/密码下次打开设置页会以圆点（••••）回填，点字段右侧的**小眼睛**即可查看明文。

### 2. 日常使用

1. 在网页上点「发送验证码」，邮件到达后，扩展工具栏图标会出现**红色角标**提示有新验证码（每 ~30 秒检查一次）。
2. **把光标点进网页的验证码输入框**，按快捷键填充：
   - macOS：`⌘ + Shift + .`
   - Windows/Linux：`Ctrl + Shift + .`

   （快捷键可在 `chrome://extensions/shortcuts` 修改。）
3. 或者点扩展图标，在弹窗里看到验证码后点 `填充` / `复制`。

> 如上方 **Popup 截图**：弹窗顶部显示来源邮箱（如 `Outlook`）与验证码；下方一行给出
> 「到达时间 · 发件地址 · 剩余有效时间」。若同一时段有多个有效验证码，用左右
> `‹ ›` 翻页（`1 / 2`），进度条表示当前码的剩余有效期。底部 `Agent: 正常` 表示
> 与 agent 连接正常。

填充后角标自动清除；验证码默认只在到达后 **120 秒**内有效（可在设置页「验证码有效期」调整为 10–600 秒）。

### 3. 界面语言

popup 和设置页右上角有**中 / English 切换**，首次跟随浏览器语言，之后记住你的选择。

## 自部署 agent（Docker）

```bash
git clone https://github.com/zyiyao520/email-otp-autofil.git
cd email-otp-autofil
cp .env.example .env
```

复制配置模板，并至少设置稳定的凭据加密主密钥。管理后台不需要时，`OTP_ADMIN_TOKEN` 可以留空：

```bash
OTP_AGENT_MASTER_KEY=$(openssl rand -base64 32)   # 凭据加密主密钥，必须长期稳定
OTP_ADMIN_TOKEN=$(openssl rand -base64 24)        # 可选，启用 /admin 管理后台
```

启动：

```bash
docker compose up -d --build
```

- **用户**：从扩展「设置」页注册 / 登录，然后把 **Agent Base URL** 指向你的地址。
- **管理员（你）**：打开 `https://your.domain.tld/admin`，用管理 token 登录，管理邀请
  码、用户并查看统计。需要封闭注册就在那里打开「需邀请码」。

### 对外暴露

agent 在服务器上绑定 `127.0.0.1:17373`。如何把它暴露到公网是**你服务器自己的事，与本
项目无关**——把你现有的反向代理或隧道指向 `127.0.0.1:17373` 即可。常见做法：

- **Cloudflare Tunnel**——单独跑一个 `cloudflared` 连接器（与本项目分离），用 ingress
  规则把 `your.domain.tld → http://127.0.0.1:17373`。
- **反向代理**（nginx / Caddy）在 `127.0.0.1:17373` 前面做 TLS 终止。
- **SSH 端口转发**（快速测试用）：

  ```bash
  ssh -N -L 17373:127.0.0.1:17373 root@YOUR_SERVER_IP
  ```

然后把扩展的 **Agent Base URL** 设为你的公网地址。

> ⚠️ **请妥善且稳定地保管 `OTP_AGENT_MASTER_KEY`。** 它用于解密你存储的邮箱凭据。丢
> 失则每个邮箱都得重新录入；更改则之前存储的密钥再也无法解密。它永不落盘。

## 数据库与密钥存储

Agent 支持两种存储后端：

- 设置 `DATABASE_URL=postgresql://...` 时使用 PostgreSQL，推荐生产环境使用 Neon 的 pooled URL。
- 未设置 `DATABASE_URL` 时使用本地 SQLite，数据库默认位于 `data/agent.db`。

邮箱凭据（QQ 授权码、通用 IMAP 应用密码、Outlook/Gmail OAuth Token）在写入数据库前使用
**AES-256-GCM** 加密，密钥由 `OTP_AGENT_MASTER_KEY` 经 scrypt 派生。主密钥仅从环境变量读取，
不会写入数据库。用户 Session 的原始 Bearer Token 同样不会写入数据库，只保存 SHA-256 哈希。

> `OTP_AGENT_MASTER_KEY` 必须长期稳定。丢失或更改后，已存储的邮箱凭据将无法解密。
> 未设置主密钥时仅适合一次性本地测试，Agent 会打印明文存储警告。

## Shiper + Neon 部署

推荐用于 Shiper 免费层的结构：Shiper 运行 Agent，Neon PostgreSQL 负责持久化数据，Chrome
扩展安装在用户浏览器中。

Shiper 项目配置：

```text
Deployment Method: Dockerfile
Base Path: agent
Dockerfile Path: Dockerfile
Health Check Path: /health
```

最小环境变量：

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.neon.tech/neondb?sslmode=require
OTP_AGENT_MASTER_KEY=<稳定的随机主密钥>
```

可选但推荐：

```env
OTP_ADMIN_TOKEN=<独立管理令牌>
NODE_OPTIONS=--max-old-space-size=128
DB_POOL_MAX=3
```

Shiper 如果注入 `PORT`，Agent 会自动使用；否则回退到 `OTP_AGENT_PORT`，最后使用 `17373`。
首次连接 PostgreSQL 时自动建表，无需手工执行 SQL。部署后检查：

```bash
curl -fsS https://YOUR-SHIPER-DOMAIN/health
curl -fsS https://YOUR-SHIPER-DOMAIN/v1/status
```

`/health` 正常响应示例：

```json
{"ok":true,"database":true}
```

完整说明见 [`docs/deploy-shiper-neon.md`](docs/deploy-shiper-neon.md)。

## 管理 API（多租户）

由 `OTP_ADMIN_TOKEN` 做 token 鉴权（以 Bearer token 发送）。要点：

- `GET /v1/admin/stats`——用户数、近期活动、邀请码使用情况。
- `GET/POST /v1/admin/invites`、`POST /v1/admin/invites/revoke`——管理邀请码。
- `POST /v1/admin/settings`——切换「需邀请码注册」。
- `GET /v1/admin/users`、`POST /v1/admin/users/disable`——列出 / 启用 / 停用用户。

对应的浏览器后台在 `/admin`。

## 社区
本开源项目已链接并认可 [LINUX DO 社区](https://linux.do/)。

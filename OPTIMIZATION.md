# UX and compatibility enhancements

## Simplified configuration

- Docker still requires only `OTP_AGENT_MASTER_KEY` and `OTP_ADMIN_TOKEN`.
- Provider defaults now include generic IMAP.
- Generic IMAP API accepts the mailbox address, server, port, TLS flag, optional username and app password.
- Credentials are verified before being encrypted and persisted.

## Automated application

- Detects OTP fields on initial load and after SPA/DOM updates.
- Detects send/resend-code actions and starts a 2-second, 90-second scoped poll.
- Keeps state per browser tab and rejects messages older than the send action.
- Verifies expected code length before automatic fill.
- Supports single inputs and split 4–10 box widgets.
- Uses native input setters for React/Vue compatibility and confirms the value was applied.

## Broader mailbox compatibility

Built-in providers remain QQ IMAP, Outlook Graph OAuth and Gmail OAuth/Pub/Sub. Generic IMAP adds support for providers including 163/126, iCloud Mail, Yahoo, Zoho, Fastmail and self-hosted Dovecot-compatible mailboxes when IMAP is enabled and an app password is available.

### Generic IMAP API

```http
POST /v1/imap/config
Authorization: Bearer <session>
x-otp-agent-client: email-otp-autofill
Content-Type: application/json

{
  "email": "user@example.com",
  "host": "imap.example.com",
  "port": 993,
  "secure": true,
  "username": "user@example.com",
  "password": "app-password"
}
```

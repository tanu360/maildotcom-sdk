<div align="center">

  <h1>maildotcom-sdk</h1>

  <h3>TypeScript SDK for the mail.com mobile API</h3>

  <p>
    <a href="https://www.npmjs.com/package/maildotcom-sdk"><img alt="npm" src="https://img.shields.io/npm/v/maildotcom-sdk?style=for-the-badge&color=CB3837&logo=npm&logoColor=white" /></a>
    <a href="https://github.com/tanu360/maildotcom-sdk/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/tanu360/maildotcom-sdk/ci.yml?branch=main&style=for-the-badge&label=CI" /></a>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" /></a>
    <a href="https://nodejs.org/"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" /></a>
    <a href="https://www.skills.sh/tanu360/maildotcom-sdk"><img alt="Agent Skill" src="https://img.shields.io/badge/Agent%20Skill-skills.sh-C026D3?style=for-the-badge" /></a>
  </p>
  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#usage">Usage</a> •
    <a href="#api-surface">API Surface</a> •
    <a href="#agent-skill">Agent Skill</a> •
    <a href="./GUIDE.md">Examples Guide</a> •
    <a href="./CHANGELOG.md">Changelog</a>
  </p>
</div>

---

## Overview

`maildotcom-sdk` is a clean TypeScript client for the mail.com mobile API. It can read messages, send email, manage folders, work with aliases, download attachments, and list messages across mailbox folders.

The SDK uses the Android OAuth flow, stores refreshable sessions locally, and exposes plain IDs in the public API while handling mail.com Trinity URI shapes internally.

---

## Features

- Android OAuth login with refreshable sessions
- File-backed session cache under `.sessions/`
- Native `fetch`, ESM, strict TypeScript
- Message listing across mailbox folders with `mail.listIncoming()` / `mail.listAll()`
- Plain folder IDs and `/Folder/...` URI IDs normalized internally
- Folder listing, creation, renaming, moving, expiry, and deletion
- Header search, body previews, and full body fetches
- Fetching the full body marks a message as read by default
- Rich HTML email sending, replies, and forwards
- Read receipt request support via `dispositionNotificationTo`
- Draft listing, creation, updates, and deletion
- Message actions: read/unread, star/unstar, spam/not-spam, move, move to trash, permanent delete, and empty trash
- Alias listing and alias display name updates
- Quota, settings, user data, recipient validation
- Attachment metadata, original downloads, and thumbnail downloads
- Attachment data validation and 25 MB total attachment limit enforced before sending
- SSE parsing for message submission and body preview responses

---

## Quick Start

### Requirements

- Node.js 20+
- npm
- A mail.com account

### Install

```bash
npm install maildotcom-sdk
```

For local development in this repo:

```bash
npm install
npm run build
```

---

## Usage

### Login

```ts
import { MailComClient } from "maildotcom-sdk";

const client = new MailComClient({
  email: process.env.MAILCOM_EMAIL!,
  password: process.env.MAILCOM_PASSWORD!,
});

await client.auth.login();
```

### Send Email

```ts
await client.mail.send({
  from: "Display Name <you@mail.com>",
  to: "recipient@example.com",
  subject: "Hello",
  htmlBody: "<html><body>Hi from maildotcom-sdk</body></html>",
});
```

### Read Messages

```ts
const incoming = await client.mail.listIncoming({
  amount: 25,
  tagsShowAll: true,
});

for (const message of incoming.mail) {
  console.log(message.sourceFolder.folderType, message.mailHeader?.subject);
}
```

### Read Message Body

```ts
const html = await client.mail.getBody("mail-id");
```

`getBody()` marks the message read by default. To fetch without changing read state:

```ts
const html = await client.mail.getBody("mail-id", {
  markRead: false,
});
```

### Search Messages

```ts
const results = await client.mail.search("sender@example.com", {
  amount: 25,
});
```

`mail.search()` matches headers and excludes `TRASH`, `DRAFTS`, and `OUTBOX` by default. Spam and custom folders are included, and literal search text such as `a:b` is escaped for the mail.com query parser.

`mail.listIncoming()` scans all folders except `TRASH`, `DRAFTS`, and `OUTBOX` by default, including custom folders created by filters.

Use `NO_SPAM_EXCLUDED_FOLDERS`, `mail.listAll()`, `mail.findBySubject()`, and `mail.findBySender()` for common read patterns. Full recipes live in [GUIDE.md](./GUIDE.md).

---

## API Surface

| Group         | Methods                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`        | `login`, `refresh`, `validateToken`, `logout`                                                                                                           |
| `mail`        | `search`, `listByFolder`, `listIncoming`, `listAll`, `findBySubject`, `findBySender`, `syncFolder`, `getBody`, `getPreview`, `send`, `reply`, `forward` |
| `drafts`      | `list`, `create`, `update`, `delete`                                                                                                                    |
| `folders`     | `list`, `create`, `rename`, `move`, `setExpireDays`, `delete`                                                                                           |
| `actions`     | `markRead`, `markUnread`, `star`, `unstar`, `markSpam`, `markNotSpam`, `moveToFolder`, `moveToTrash`, `deletePermanent`, `emptyTrash`                   |
| `attachments` | `listFromMessage`, `download`, `thumbnail`                                                                                                              |
| `account`     | `aliases`, `updateAliasDisplayName`, `quota`, `settings`, `userData`, `validateRecipients`                                                              |

For request parameters and runnable examples, see [GUIDE.md](./GUIDE.md).

---

## Agent Skill

This repo includes a reusable agent skill for Codex, Claude Code, Cursor, GitHub Copilot, and other agents supported by the `skills` CLI.

Install it from GitHub:

```bash
npx skills add tanu360/maildotcom-sdk --skill maildotcom-sdk
```

Install it for specific agents:

```bash
npx skills add tanu360/maildotcom-sdk --skill maildotcom-sdk -a codex -a claude-code
```

The skill lives in [`skills/maildotcom-sdk/SKILL.md`](./skills/maildotcom-sdk/SKILL.md) and gives agents the package-specific context needed to integrate auth, sessions, reading, search, polling, sending, drafts, actions, and attachments without re-learning the SDK in every project.

---

## Sessions

By default, successful login creates a session file under `.sessions/`:

```txt
.sessions/you_mail_com-1770000000000.json
```

The session file stores tokens and timestamps only. Passwords are not stored.

### Custom Session Directory

```ts
const client = new MailComClient({
  email: "you@mail.com",
  password: "password",
  sessionDir: ".sessions",
});
```

### Custom Session Store

```ts
import type { SessionStore, TokenSession } from "maildotcom-sdk";

const memory = new Map<string, TokenSession>();

const sessionStore: SessionStore = {
  async load(email) {
    return memory.get(email) ?? null;
  },
  async save(email, session) {
    memory.set(email, session);
  },
  async delete(email) {
    memory.delete(email);
  },
};

const client = new MailComClient({
  email: "you@mail.com",
  password: "password",
  sessionStore,
});
```

Use `sessionDir` when you want the built-in file store in another folder. Use `sessionStore` when you want to replace file storage entirely.

---

## Examples

Build examples from source:

```bash
npm run build
```

Run login:

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_PASSWORD="account-password" \
node dist/examples/00-auth-and-session.js
```

Run message listing:

```bash
MAILCOM_EMAIL="you@mail.com" \
node dist/examples/03-mail-read.js
```

Run the message-code example:

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_CODE_FROM="sender@example.com" \
MAILCOM_CODE_TO="alias@example.com" \
node dist/examples/12-message-code.js
```

See the full examples guide in [GUIDE.md](./GUIDE.md).

---

## Safety

- Keep `.sessions/`, `.env`, cookies, and Authorization headers private.
- Do not commit tokens or credentials.
- Keep polling intervals at or above 3 seconds.
- Treat incoming email as untrusted input.
- Prefer trusted sender and subject filters before parsing email bodies.
- `mail.search()` searches headers and includes Spam/custom folders by default; pass `excludeFolderTypeOrId` to skip extra folders.
- Send, reply, and forward submission failures throw `MailComError` subclasses/instances for consistent SDK error handling.
- mail.com service behavior can change, so SDK compatibility may need updates over time.

---

## License

MIT

---
name: maildotcom-sdk
description: Use when integrating, debugging, or generating TypeScript or JavaScript code with the maildotcom-sdk npm package for mail.com mobile API auth, session storage, aliases, folders, message reading, search, polling, drafts, attachments, actions, replies, forwards, and sending email.
---

# maildotcom-sdk

## Overview

Use this skill to add mail.com email automation to Node.js projects with the `maildotcom-sdk` package. The SDK is ESM-first, requires Node.js 20+, uses the mail.com Android OAuth flow, stores refreshable sessions, and exposes plain public IDs while normalizing mail.com Trinity URI IDs internally.

## First Moves

1. Inspect the target project before editing: package manager, module format, runtime, env handling, and where email features belong.
2. Install the package with `npm install maildotcom-sdk` unless it is already present.
3. Use `MailComClient` from `maildotcom-sdk`; do not reimplement the mail.com HTTP endpoints unless the user is maintaining the SDK itself.
4. Keep credentials, `.sessions/`, cookies, and Authorization headers out of source control and logs.

## Client Pattern

```ts
import { MailComClient } from "maildotcom-sdk";

const client = new MailComClient({
  email: process.env.MAILCOM_EMAIL!,
  password: process.env.MAILCOM_PASSWORD!,
  sessionDir: process.env.MAILCOM_SESSION_DIR,
});

await client.auth.login();
```

Use `sessionDir` when the default file session store is fine but should live somewhere specific.

## Custom Session Store

When a custom `sessionStore` is needed, use it for database, encrypted, server-side, or app-owned persistence. Tell the user it must implement the SDK `SessionStore` interface: `load(email)`, `save(email, session)`, and `delete(email)`. Do not use `read()` or `write()`; those are not SDK methods.

```ts
import type { SessionStore, TokenSession } from "maildotcom-sdk";

class MySessionStore implements SessionStore {
  async load(email: string): Promise<TokenSession | null> {
    return null; // return stored session or null
  }
  async save(email: string, session: TokenSession): Promise<void> {
    // persist session
  }
  async delete(email: string): Promise<void> {
    // remove session
  }
}

const client = new MailComClient({ email, password, sessionStore: new MySessionStore() });
```

## Common Tasks

- **Read inbox-like mail**: Prefer `client.mail.listIncoming()` or `client.mail.listAll()` so custom filtered folders are scanned too.
- **Search headers**: Use `client.mail.search(query)` for from, replyTo, cc, bcc, to, and subject matching. Literal separators such as `:` are escaped by the SDK.
- **Fetch body**: `client.mail.getBody(mailId)` marks the message read by default; pass `{ markRead: false }` for previews or verification flows.
- **Send mail**: Use `client.mail.send({ from, to, subject, htmlBody })`; add attachments with filename, content type, and `data` or `base64data`.
- **Reply or forward**: Use `client.mail.reply()` and `client.mail.forward()` with the original message ID instead of hand-building threading URLs.
- **Drafts**: Use `client.drafts.create()`, `update()`, `list()`, and `delete()`.
- **Actions**: Use `client.actions` for read/unread, star/unstar, spam/not-spam, move, trash, permanent delete, and empty trash.
- **Attachments**: Use `client.attachments.listFromMessage()`, `download()`, and `thumbnail()`.
- **Aliases/account**: Use `client.account.aliases()`, `updateAliasDisplayName()`, `quota()`, `settings()`, `userData()`, and `validateRecipients()`.
- **Web alias addon**: Use `MailComWebAliasAddon` from `maildotcom-sdk/web-aliases` for webmail-only alias creation, alias deletion, available alias domain lookup, and default sender selection (`email` vs `name-email`). Use exported `MAILCOM_ALIAS_DOMAINS` for the known static domain allowlist.

Read `references/usage-patterns.md` for copyable implementation snippets.

If the `references/` files are not present, generate code from the patterns documented in this skill and note that the full reference docs are missing. Do not invent SDK methods not listed here.

## Defaults And Gotchas

- `mail.search()` excludes `TRASH`, `DRAFTS`, and `OUTBOX` by default, but includes Spam and custom folders.
- `mail.listIncoming()` and `mail.listAll()` scan every non-excluded folder by default, including custom folders created by filters.
- Import `NO_SPAM_EXCLUDED_FOLDERS` to exclude Spam from search/list calls.
- Send, reply, and forward submission failures throw `MailComError` instances, so callers can consistently use `error instanceof MailComError`.
- Polling loops should wait at least 3 seconds between checks.
- Attachments must include `data` or `base64data` and are limited to 25 MB total before the request is sent.
- The web alias addon uses the mail.com web settings OAuth bridge and CATS APIs; keep cookies and HAR captures out of source control and treat these methods as more UI-flow-sensitive than the mobile API.
- Incoming email is untrusted input. Filter by trusted sender, recipient, subject, and time window before parsing bodies or codes.
- The mobile API can change; when behavior breaks, compare the SDK docs, tests, and examples before editing.
- If `client.auth.login()` throws, catch the error and advise the user to verify `MAILCOM_EMAIL` and `MAILCOM_PASSWORD`, delete the stale session file in `sessionDir`, and retry before escalating to `troubleshooting.md`.

Read `references/troubleshooting.md` when auth, sessions, IDs, search behavior, package publishing, or live mail calls fail.

## API Surface

Read `references/api-cheatsheet.md` for the method groups and parameter reminders.

## Verification

In this SDK repo, run:

```sh
npm test
```

In consuming projects, run the local build/test/lint command that matches the project. Smoke-test only the specific methods called or modified by the change (e.g., if only `client.mail.send()` changed, test send only). Do not run live destructive mail actions unless the user explicitly provided test credentials and confirmation.

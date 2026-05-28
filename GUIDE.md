<div align="center">

  <h1>maildotcom-sdk Examples Guide</h1>

  <h3>Runnable examples for auth, message reading, sending, folders, drafts, attachments, aliases, and message code extraction</h3>

  <p>
    <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" /></a>
    <a href="https://nodejs.org/"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-20+-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" /></a>
    <img alt="ESM" src="https://img.shields.io/badge/ESM-Native-64748B?style=for-the-badge" />
    <img alt="Fetch" src="https://img.shields.io/badge/Fetch-Native-F97316?style=for-the-badge" />
    <img alt="Examples" src="https://img.shields.io/badge/Examples-13-8B5CF6?style=for-the-badge" />
  </p>

  <p>
    <a href="#overview">Overview</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#environment">Environment</a> •
    <a href="#examples">Examples</a> •
    <a href="#api-reference">API Reference</a> •
    <a href="#recipes">Recipes</a> •
    <a href="#workflows">Workflows</a> •
    <a href="#safety">Safety</a>
  </p>
</div>

---

## Overview

This folder contains live, runnable examples for `maildotcom-sdk`.

The examples are written as SDK guide samples: each file focuses on one area, uses environment variables for input, documents the confirmed request parameters in comments, and exits safely when required variables are missing.

No example depends on `.learn/`, HAR files, captured credentials, or guessed endpoints.

---

## Quick Start

### Requirements

- Node.js 20+
- npm
- A mail.com account

### Build

```bash
npm install
npm run build
```

### Run Login

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_PASSWORD="account-password" \
node dist/examples/00-auth-and-session.js
```

After the first successful login, the SDK stores a token session under `.sessions/`. Later examples can usually run with only `MAILCOM_EMAIL` while that session is still valid.

```bash
MAILCOM_EMAIL="you@mail.com" \
node dist/examples/03-mail-read.js
```

<details>
  <summary>Run common examples</summary>

```bash
# Read latest messages
MAILCOM_EMAIL="you@mail.com" \
node dist/examples/03-mail-read.js

# Send a rich HTML email
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_TO="recipient@example.com" \
node dist/examples/04-send-mail.js

# Poll trusted messages for a code
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_CODE_FROM="sender@example.com" \
MAILCOM_CODE_TO="alias@example.com" \
node dist/examples/12-message-code.js
```

</details>

---

## Environment

### Common Variables

| Variable | Required | Used by | Purpose |
| --- | --- | --- | --- |
| `MAILCOM_EMAIL` | Yes | All live examples | Account email address |
| `MAILCOM_PASSWORD` | First login only | Auth/session | Password used when no valid cached session exists |
| `MAILCOM_SESSION_DIR` | No | Auth/session | Custom session directory, defaults to `.sessions` |
| `MAILCOM_FROM` | No | Send, reply, forward, drafts | Sender string, supports `Display Name <address@mail.com>` |
| `MAILCOM_TO` | Depends | Send, reply, forward, drafts | Primary recipient |
| `MAILCOM_CC` | No | Send, reply, forward, drafts | CC recipient |
| `MAILCOM_BCC` | No | Send, reply, forward, drafts | BCC recipient |
| `MAILCOM_SUBJECT` | No | Send, reply, forward, drafts | Message subject |
| `MAILCOM_HTML_BODY` | No | Send, reply, forward, drafts | HTML body |
| `MAILCOM_ATTACHMENTS` | No | Send, attachments | Comma-separated local file paths |
| `MAILCOM_ATTACHMENT_CONTENT_TYPES` | No | Send, attachments | Comma-separated content types matching `MAILCOM_ATTACHMENTS` |
| `MAILCOM_SEARCH` | No | Message reading | Header search query |
| `MAILCOM_SEARCH_EXCLUDE_SPAM` | No | Message reading | Set `true` to use `NO_SPAM_EXCLUDED_FOLDERS` |
| `MAILCOM_FIND_SUBJECT` | No | Message reading | Run `mail.findBySubject()` |
| `MAILCOM_FIND_SENDER` | No | Message reading | Run `mail.findBySender()` |

### Safe-by-Default Behavior

If a required variable is missing, examples print a structured skip message and exit with code `0`.

```json
{
  "skipped": true,
  "reason": "MAILCOM_TO is required to send an email.",
  "requiredEnv": ["MAILCOM_TO"]
}
```

Destructive examples require explicit confirmation variables such as `MAILCOM_CONFIRM_DESTRUCTIVE=true`.

---

## Examples

| File | Area | What it demonstrates |
| --- | --- | --- |
| [`00-auth-and-session.ts`](./examples/00-auth-and-session.ts) | Auth | Login, cached session load, token validation, refresh, logout |
| [`01-account-and-aliases.ts`](./examples/01-account-and-aliases.ts) | Account | User data, quota, settings, aliases, recipient validation, alias display name update |
| [`02-folders.ts`](./examples/02-folders.ts) | Folders | List, create, rename, move, set expiry, delete |
| [`03-mail-read.ts`](./examples/03-mail-read.ts) | Message reading | Scan messages across non-excluded folders, list folders, sync changes, search headers, find by subject/sender, preview bodies, fetch full bodies |
| [`04-send-mail.ts`](./examples/04-send-mail.ts) | Sending | Rich HTML email, sender display name, attachments, priority, read receipt request |
| [`05-reply-forward.ts`](./examples/05-reply-forward.ts) | Reply/forward | Reply to an original message, forward an original message |
| [`06-drafts.ts`](./examples/06-drafts.ts) | Drafts | List, create, update, delete drafts |
| [`07-actions.ts`](./examples/07-actions.ts) | Actions | Read/unread, star/unstar, spam/not-spam, move, trash, permanent delete, empty trash |
| [`08-attachments.ts`](./examples/08-attachments.ts) | Attachments | List attachment metadata, download original, download thumbnail |
| [`09-incoming-poll.ts`](./examples/09-incoming-poll.ts) | Workflow | Poll recent messages |
| [`10-read-receipt.ts`](./examples/10-read-receipt.ts) | Workflow | Send with a read receipt request and optionally search for a receipt email |
| [`11-folder-lifecycle.ts`](./examples/11-folder-lifecycle.ts) | Workflow | Create a folder, move a message into it, verify, move it back, delete the folder |
| [`12-message-code.ts`](./examples/12-message-code.ts) | Workflow | Poll trusted messages and extract a code |

---

## API Reference

These are the SDK request parameters shown in the examples. They are based on confirmed SDK behavior and mail.com mobile API shapes already implemented in this package.

### Client

```ts
new MailComClient({
  email,
  password,
  sessionDir,
  sessionStore,
  fetch,
});
```

| Param | Required | Purpose |
| --- | --- | --- |
| `email` | Yes | Account email |
| `password` | First login only | Used when no valid cached session exists |
| `sessionDir` | No | Directory for file sessions |
| `sessionStore` | No | Custom session store implementation |
| `fetch` | No | Custom fetch implementation |

`sessionDir` and `sessionStore` are different levels of control:

- `sessionDir` keeps the SDK default file session store, but changes where session JSON files are written.
- `sessionStore` replaces file storage entirely with your own `load`, `save`, and `delete` implementation.
- If `sessionStore` is provided, `sessionDir` is not used.

### Auth

```ts
await client.auth.login();
await client.auth.validateToken(token);
await client.auth.refresh(refreshToken);
await client.auth.logout();
```

| Method | Params |
| --- | --- |
| `login()` | none |
| `validateToken(token?)` | optional access token |
| `refresh(refreshToken?)` | optional refresh token |
| `logout()` | none |

### Reading Messages

```ts
await client.mail.listIncoming({
  amount,
  orderBy,
  condition,
  tagsShowAll,
  excludeFolderTypeOrId,
  includeSpam,
});
```

```ts
await client.mail.listAll({
  amount,
  orderBy,
  condition,
  tagsShowAll,
  excludeFolderTypeOrId,
  includeSpam,
});
```

```ts
await client.mail.listByFolder(folderId, {
  amount,
  orderBy,
  condition,
  tagsShowAll,
  format,
});
```

```ts
await client.mail.syncFolder(folderId, {
  after,
  condition,
  orderBy,
});
```

| Method | Confirmed params |
| --- | --- |
| `mail.search(query, options)` | `amount`, `excludeFolderTypeOrId`, `orderBy` |
| `mail.listByFolder(folderId, options)` | `amount`, `orderBy`, `condition`, `tagsShowAll`, `format` |
| `mail.listIncoming(options)` | `amount`, `orderBy`, `condition`, `tagsShowAll`, `excludeFolderTypeOrId`, `includeSpam` |
| `mail.listAll(options)` | alias for `mail.listIncoming(options)` |
| `mail.findBySubject(subject, options)` | `amount`, `excludeFolderTypeOrId`, `orderBy` |
| `mail.findBySender(sender, options)` | `amount`, `excludeFolderTypeOrId`, `orderBy` |
| `mail.syncFolder(folderId, options)` | `after`, `condition`, `orderBy` |
| `mail.getBody(mailId, options)` | `format`, `markRead` |
| `mail.getPreview(mailIds)` | `mailId` or `mailId[]` |

`mail.search()` searches message headers and excludes `TRASH`, `DRAFTS`, and `OUTBOX` by default. Spam and custom folders are included. To skip Spam, pass:

```ts
import { NO_SPAM_EXCLUDED_FOLDERS } from "maildotcom-sdk";

await client.mail.search("sender@example.com", {
  amount: 25,
  excludeFolderTypeOrId: NO_SPAM_EXCLUDED_FOLDERS,
});
```

`mail.listIncoming()` and `mail.listAll()` scan messages in all folders except `TRASH`, `DRAFTS`, and `OUTBOX` by default, so custom filtered folders are included. To skip extra folders, pass `excludeFolderTypeOrId`.

The SDK exports typed folder exclusion presets:

```ts
import { DEFAULT_EXCLUDED_FOLDERS, NO_SPAM_EXCLUDED_FOLDERS } from "maildotcom-sdk";
```

`mail.findBySubject()` and `mail.findBySender()` use the confirmed header search endpoint, then filter returned messages locally by subject or sender.

### Sending Emails

```ts
await client.mail.send({
  from,
  to,
  cc,
  bcc,
  subject,
  htmlBody,
  attachments,
  priority,
  date,
  dispositionNotificationTo,
  uuid,
});
```

| Param | Required | Purpose |
| --- | --- | --- |
| `from` | No | Sender string. Supports `Display Name <address@mail.com>` |
| `to` | Yes | Recipient or recipients |
| `cc` | No | CC recipient or recipients |
| `bcc` | No | BCC recipient or recipients |
| `subject` | No | Subject |
| `htmlBody` | Yes | HTML message body |
| `attachments` | No | Files encoded by SDK, max total size 25 MB |
| `priority` | No | mail.com priority string, default `"3"` |
| `date` | No | Millisecond timestamp |
| `dispositionNotificationTo` | No | Read receipt request address or addresses |
| `uuid` | No | Submission transient UUID |

### Reply and Forward

```ts
await client.mail.reply({
  originalMailId,
  htmlBody,
  to,
  from,
  cc,
  bcc,
  subject,
  attachments,
  priority,
  date,
  uuid,
  originalMail,
});
```

```ts
await client.mail.forward({
  originalMailId,
  from,
  to,
  cc,
  bcc,
  subject,
  htmlBody,
  attachments,
  priority,
  date,
  uuid,
  originalMail,
});
```

### Drafts

```ts
await client.drafts.create({
  from,
  to,
  cc,
  bcc,
  subject,
  htmlBody,
  attachments,
  priority,
  date,
  dispositionNotificationTo,
});
```

| Method | Params |
| --- | --- |
| `drafts.list()` | none |
| `drafts.create(input)` | same base message parameters as send, without `uuid` |
| `drafts.update(draftId, input)` | draft ID plus the same base message parameters |
| `drafts.delete(mailIds)` | message ID or message ID array |

### Folders

| Method | Params |
| --- | --- |
| `folders.list()` | none |
| `folders.create(input)` | folder name string or `{ name, folderType }` |
| `folders.rename(folderId, name)` | folder ID, new name |
| `folders.move(folderId, parentFolderId)` | folder ID, parent folder ID |
| `folders.setExpireDays(folderId, days)` | folder ID, expiry days |
| `folders.delete(folderId)` | folder ID |

### Actions

| Method | Params |
| --- | --- |
| `actions.markRead(mailIds)` | message ID or message ID array |
| `actions.markUnread(mailIds)` | message ID or message ID array |
| `actions.star(mailIds)` | message ID or message ID array |
| `actions.unstar(mailIds)` | message ID or message ID array |
| `actions.markSpam(mailIds)` | message ID or message ID array |
| `actions.markNotSpam(mailIds)` | message ID or message ID array |
| `actions.moveToFolder(mailIds, folderId)` | message ID or message ID array, target folder ID |
| `actions.moveToTrash(mailIds)` | message ID or message ID array |
| `actions.deletePermanent(mailIds)` | message ID or message ID array |
| `actions.emptyTrash()` | none |

### Attachments

| Method | Params |
| --- | --- |
| `attachments.listFromMessage(message)` | message object from list/search responses |
| `attachments.download(mailId, attachmentId)` | message ID, attachment ID |
| `attachments.thumbnail(mailId, attachmentId, options)` | message ID, attachment ID, `{ width, height }` |

### Account

| Method | Params |
| --- | --- |
| `account.userData()` | none |
| `account.quota()` | none |
| `account.settings()` | none |
| `account.aliases()` | none |
| `account.validateRecipients(addresses)` | one address or address array |
| `account.updateAliasDisplayName(address, displayName)` | alias address, display name |

---

## Recipes

<details>
  <summary>Auth and session</summary>

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_PASSWORD="account-password" \
node dist/examples/00-auth-and-session.js
```

Optional:

```bash
MAILCOM_REFRESH_NOW=true
MAILCOM_LOGOUT=true
```

</details>

<details>
  <summary>Send, reply, and forward</summary>

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_TO="recipient@example.com" \
MAILCOM_FROM="Display Name <you@mail.com>" \
node dist/examples/04-send-mail.js
```

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_ORIGINAL_MAIL_ID="message-id-placeholder" \
MAILCOM_TO="recipient@example.com" \
node dist/examples/05-reply-forward.js
```

</details>

<details>
  <summary>Common message patterns</summary>

Search all mail headers with the default exclusions:

```ts
await client.mail.search("billing@example.com");
```

Search while excluding Spam:

```ts
import { NO_SPAM_EXCLUDED_FOLDERS } from "maildotcom-sdk";

await client.mail.search("billing@example.com", {
  excludeFolderTypeOrId: NO_SPAM_EXCLUDED_FOLDERS,
});
```

Scan folders and read a body:

```ts
const incoming = await client.mail.listAll({ amount: 25 });
const first = incoming.mail[0];

if (first?.attribute?.mailIdentifier) {
  const html = await client.mail.getBody(first.attribute.mailIdentifier);
  console.log(html);
}
```

Send with an attachment:

```ts
import { readFile } from "node:fs/promises";

const data = await readFile("./invoice.pdf");

await client.mail.send({
  from: "Display Name <you@mail.com>",
  to: "recipient@example.com",
  subject: "Invoice",
  htmlBody: "<html><body>Please see attached.</body></html>",
  attachments: [
    {
      filename: "invoice.pdf",
      contentType: "application/pdf",
      data,
    },
  ],
});
```

</details>

<details>
  <summary>Actions and destructive operations</summary>

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_ACTION="mark-read" \
MAILCOM_MAIL_IDS="message-id-placeholder" \
node dist/examples/07-actions.js
```

Permanent delete and empty trash require:

```bash
MAILCOM_CONFIRM_DESTRUCTIVE=true
```

</details>

---

## Workflows

### Incoming Poll

Use [09-incoming-poll.ts](./examples/09-incoming-poll.ts) when you want a small polling loop for new messages.

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_POLL_ITERATIONS=3 \
MAILCOM_PREVIEW_NEW=true \
node dist/examples/09-incoming-poll.js
```

It checks all non-excluded folders by default.

### Read Receipt Request

Use [10-read-receipt.ts](./examples/10-read-receipt.ts) to send an email with `dispositionNotificationTo`.

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_TO="recipient@example.com" \
MAILCOM_READ_RECEIPT_TO="you@mail.com" \
node dist/examples/10-read-receipt.js
```

The SDK can request a receipt. mail.com does not expose a confirmed direct "seen timestamp" endpoint in this package.

### Message Code Fetch

Use [12-message-code.ts](./examples/12-message-code.ts) when you want to poll trusted messages and extract a short numeric code.

```bash
MAILCOM_EMAIL="you@mail.com" \
MAILCOM_CODE_FROM="sender@example.com" \
MAILCOM_CODE_TO="alias@example.com" \
node dist/examples/12-message-code.js
```

Default trusted filters:

```txt
From: sender@example.com
Subject contains: code
```

The example checks the subject first, then the preview, then the full HTML body. Fetching the full body marks the message as read by default because that is how normal message reading behaves in the SDK.

---

## Safety

- Treat incoming email as untrusted input.
- Prefer sender and subject allowlists before parsing bodies.
- Keep polling intervals at or above 3 seconds.
- Destructive actions require explicit confirmation variables.
- Do not commit `.sessions/`, `.env`, HAR files, or captured tokens.
- Do not add guessed request parameters to examples. If an endpoint is not confirmed, leave it out.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Example prints `skipped` | Set the required env vars shown in the skip output |
| Password is required | Add `MAILCOM_PASSWORD`, or login once to create a `.sessions/` file |
| Send fails for attachments | Keep total attachment size at or below 25 MB |
| Code not found | Check sender/subject filters and increase `MAILCOM_CODE_TIMEOUT_MS` |
| Body read marks mail read | Set `MAILCOM_BODY_MARK_READ=false` or `MAILCOM_CODE_MARK_READ=false` where supported |
| Search misses a message | `mail.search()` includes Spam/custom folders by default. Check header filters first, then use `mail.listIncoming()` for broad folder reads |

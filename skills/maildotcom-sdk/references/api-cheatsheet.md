# API Cheatsheet

## Import

```ts
import {
  DEFAULT_EXCLUDED_FOLDERS,
  MailComClient,
  NO_SPAM_EXCLUDED_FOLDERS,
  type SessionStore,
  type TokenSession,
} from "maildotcom-sdk";

import { MAILCOM_ALIAS_DOMAINS, MailComWebAliasAddon } from "maildotcom-sdk/web-aliases";
```

## Client Options

```ts
new MailComClient({
  email,
  password,
  sessionDir,
  sessionStore,
  fetch,
});
```

- `email`: required account email.
- `password`: required only when no valid cached session exists.
- `sessionDir`: optional directory for the built-in file session store.
- `sessionStore`: optional replacement implementing `load`, `save`, and `delete`.
- `fetch`: optional custom fetch implementation.

## Method Groups

| Group | Methods |
| --- | --- |
| `auth` | `login`, `refresh`, `validateToken`, `logout` |
| `mail` | `search`, `listByFolder`, `listIncoming`, `listAll`, `findBySubject`, `findBySender`, `syncFolder`, `getBody`, `getPreview`, `send`, `reply`, `forward` |
| `drafts` | `list`, `create`, `update`, `delete` |
| `folders` | `list`, `create`, `rename`, `move`, `setExpireDays`, `delete` |
| `actions` | `markRead`, `markUnread`, `star`, `unstar`, `markSpam`, `markNotSpam`, `moveToFolder`, `moveToTrash`, `deletePermanent`, `emptyTrash` |
| `attachments` | `listFromMessage`, `download`, `thumbnail` |
| `account` | `aliases`, `updateAliasDisplayName`, `quota`, `settings`, `userData`, `validateRecipients` |
| `web-aliases` | `createAlias`, `deleteAlias`, `availableDomains`, `setDefaultAlias`, `defaultSenderOptions` |

## Reading Options

```ts
await client.mail.listIncoming({
  amount,
  orderBy,
  condition,
  tagsShowAll,
  excludeFolderTypeOrId,
  includeSpam,
});

await client.mail.search(query, {
  amount,
  excludeFolderTypeOrId,
  orderBy,
});

await client.mail.getBody(mailId, {
  format: "html",
  markRead: false,
});
```

- `listAll()` is an alias for `listIncoming()`.
- `syncFolder(folderId, { after })` returns URI-list style deltas.
- `getPreview(mailIdOrIds)` returns parsed SSE JSON preview data.

## Sending Options

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

- `to`, `cc`, `bcc`, and `dispositionNotificationTo` accept a string or string array where supported.
- `attachments` are `{ filename, contentType, data }` or `{ filename, contentType, base64data }`.
- `priority` defaults to `"3"`.
- `uuid` is optional and used for transient message submission identity.

## Drafts

```ts
await client.drafts.create({ from, to, subject, htmlBody });
await client.drafts.update(draftId, { from, to, subject, htmlBody });
await client.drafts.delete(draftIdOrIds);
```

Draft create/update may receive an empty 201 from mail.com; the SDK resolves this by reading the draft list and matching the created draft.

## Attachments

```ts
const attachments = client.attachments.listFromMessage(message);
const file = await client.attachments.download(mailId, attachmentId);
const thumb = await client.attachments.thumbnail(mailId, attachmentId, {
  width: 160,
  height: 160,
});
```

Downloaded files include binary `data`, optional `contentType`, and optional `filename`.

## Web Alias Addon

```ts
const webAliases = new MailComWebAliasAddon({ email, password });

console.log(MAILCOM_ALIAS_DOMAINS);
await webAliases.createAlias("my-alias@mail.com");
const domains = await webAliases.availableDomains();
await webAliases.setDefaultAlias("my-alias@mail.com", { sender: "email" });
await webAliases.setDefaultAlias("my-alias@mail.com", { sender: "name-email" });
await webAliases.deleteAlias("my-alias@mail.com");
```

Use this separate addon for alias creation, alias deletion, available alias domain lookup, and default sender variant selection. `MAILCOM_ALIAS_DOMAINS` is the static known domain allowlist; `createAlias()` rejects domains outside it before opening webmail. `client.account.aliases()` and `client.account.updateAliasDisplayName()` remain the mobile API methods for listing aliases and changing display names.

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
- `attachments` are `{ filename, contentType, data }`.
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

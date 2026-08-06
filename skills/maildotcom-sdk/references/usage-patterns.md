# Usage Patterns

## Basic Client

```ts
import { MailComClient } from "maildotcom-sdk";

export function createMailClient() {
  return new MailComClient({
    email: process.env.MAILCOM_EMAIL!,
    password: process.env.MAILCOM_PASSWORD,
    sessionDir: process.env.MAILCOM_SESSION_DIR ?? ".sessions",
  });
}
```

`password` may be omitted after a valid session exists.

## List Recent Mail

```ts
const client = createMailClient();
await client.auth.login();

const incoming = await client.mail.listIncoming({
  amount: 25,
  tagsShowAll: true,
});

for (const message of incoming.mail) {
  console.log({
    id: message.attribute?.mailIdentifier,
    folder: message.sourceFolder.folderType,
    from: message.mailHeader?.from,
    subject: message.mailHeader?.subject,
    date: message.mailHeader?.date,
  });
}
```

## Search Without Spam

```ts
import { MailComClient, NO_SPAM_EXCLUDED_FOLDERS } from "maildotcom-sdk";

const client = new MailComClient({
  email: process.env.MAILCOM_EMAIL!,
  password: process.env.MAILCOM_PASSWORD,
});

const results = await client.mail.search("billing@example.com", {
  amount: 25,
  excludeFolderTypeOrId: NO_SPAM_EXCLUDED_FOLDERS,
});
```

## Read Body Without Marking Read

```ts
const html = await client.mail.getBody(mailId, {
  format: "html",
  markRead: false,
});
```

Use this for preview, OTP, or monitoring workflows where read state matters.

## Send HTML Mail

```ts
await client.mail.send({
  from: "Display Name <you@mail.com>",
  to: "recipient@example.com",
  subject: "Hello",
  htmlBody: "<html><body>Hi from maildotcom-sdk</body></html>",
});
```

## Web Alias Mutations

```ts
import { MAILCOM_ALIAS_DOMAINS, MailComWebAliasAddon } from "maildotcom-sdk/web-aliases";

const webAliases = new MailComWebAliasAddon({
  email: process.env.MAILCOM_EMAIL!,
  password: process.env.MAILCOM_PASSWORD!,
});

console.log(MAILCOM_ALIAS_DOMAINS);
await webAliases.createAlias("my-alias@mail.com");
const domains = await webAliases.availableDomains();
await webAliases.setDefaultAlias("my-alias@mail.com", { sender: "email" });
await webAliases.setDefaultAlias("my-alias@mail.com", { sender: "name-email" });
await webAliases.deleteAlias("my-alias@mail.com");
```

Use `client.account.aliases()` to verify alias state and `client.account.updateAliasDisplayName()` before selecting `name-email` when the alias needs a display name. `MAILCOM_ALIAS_DOMAINS` is the static known domain allowlist; `createAlias()` rejects domains outside it before login, while `availableDomains()` returns the subset currently advertised by mail.com. The addon uses mail.com's web settings OAuth bridge and CATS APIs. Non-deletable primary addresses are rejected before removal; deletable default aliases follow mail.com's server behavior.

## Send With Attachment

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

## Reply

```ts
await client.mail.reply({
  originalMailId: mailId,
  to: "sender@example.com",
  from: "You <you@mail.com>",
  htmlBody: "<html><body>Thanks, received.</body></html>",
});
```

## Draft Lifecycle

```ts
const draft = await client.drafts.create({
  from: "You <you@mail.com>",
  to: "recipient@example.com",
  subject: "Draft subject",
  htmlBody: "<html><body>Draft body</body></html>",
});

await client.drafts.update(draft.attribute!.mailIdentifier!, {
  from: "You <you@mail.com>",
  to: "recipient@example.com",
  subject: "Updated subject",
  htmlBody: "<html><body>Updated body</body></html>",
});

await client.drafts.delete(draft.attribute!.mailIdentifier!);
```

## Poll For A Code

```ts
const trustedFrom = "security@example.com";
const since = Date.now() - 5 * 60 * 1000;

for (let attempt = 0; attempt < 10; attempt += 1) {
  const incoming = await client.mail.listIncoming({
    amount: 25,
    condition: `mail.internaldate.after:${since}`,
    tagsShowAll: true,
  });

  const match = incoming.mail.find((message) => {
    const from = message.mailHeader?.from?.toLowerCase() ?? "";
    const subject = message.mailHeader?.subject ?? "";
    return from.includes(trustedFrom) && /code|verify|otp/i.test(subject);
  });

  const id = match?.attribute?.mailIdentifier;
  if (id) {
    const html = await client.mail.getBody(id, { markRead: false });
    const code = html.match(/\b\d{6}\b/)?.[0];
    if (code) return code;
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));
}

throw new Error("No code email arrived in time.");
```

## Custom Session Store

```ts
import { MailComClient, type SessionStore, type TokenSession } from "maildotcom-sdk";

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
  email: process.env.MAILCOM_EMAIL!,
  password: process.env.MAILCOM_PASSWORD,
  sessionStore,
});
```

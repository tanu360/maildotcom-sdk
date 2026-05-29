# Troubleshooting

## Auth And Sessions

- If login fails, confirm `MAILCOM_EMAIL` and `MAILCOM_PASSWORD` are present for the first login.
- If a valid cached session exists, the SDK can login without the password by loading the session.
- If a cached access token is invalid but a refresh token exists, the SDK refreshes and saves the new session.
- Authorized requests refresh once on 401 and retry.
- `auth.logout()` revokes using the refresh token and clears the configured session store.

## Session Storage

- Default file sessions are stored under `.sessions/`.
- Add `.sessions/` to `.gitignore` in consuming projects.
- Use `sessionDir` to move file sessions.
- Use `sessionStore` to persist sessions in a database, encrypted store, server-side cache, or app-specific credential system.
- Do not log session JSON, refresh tokens, access tokens, cookies, or Authorization headers.

## IDs

- Public methods accept plain IDs and many Trinity URI-shaped IDs.
- The SDK normalizes mail, attachment, and folder IDs internally.
- Prefer message IDs from `message.attribute?.mailIdentifier` when processing list/search results.

## Search And Folder Surprises

- `mail.search()` searches headers, not full message bodies.
- `mail.search()` excludes `TRASH`, `DRAFTS`, and `OUTBOX` by default.
- Literal query separators such as `:` are escaped before `mail.search()` sends the condition to mail.com.
- Spam is included by default. Use `NO_SPAM_EXCLUDED_FOLDERS` or `includeSpam: false` where the method supports it.
- `mail.listIncoming()` scans custom folders by default, which is usually correct for filtered inbox workflows.

## Body Reads

- `mail.getBody(mailId)` marks the message read by default.
- Use `mail.getBody(mailId, { markRead: false })` for verification codes, preview flows, or read-only automations.
- Prefer `getPreview()` before `getBody()` if a workflow only needs short preview text.

## Polling

- Keep intervals at or above 3 seconds.
- Filter by trusted sender, recipient, subject, and time window before parsing a body.
- Treat HTML email as untrusted input. Parse defensively and avoid executing remote content.

## Sending And Attachments

- `htmlBody` is required for send/draft/reply/forward payloads.
- Send, reply, and forward submission failures throw `MailComError` instances.
- Total attachment bytes must stay under 25 MB.
- Always include filename, content type, and either `data` or `base64data` for attachments.
- For read receipts, use `dispositionNotificationTo`; this package does not expose a confirmed seen-timestamp endpoint.

## Local SDK Development

Run this in the SDK repo:

```sh
npm test
```

The test script builds with TypeScript and runs Node's test runner against `dist/tests/*.test.js`.

## npm Publishing

If `npm publish` passes tests and packing but fails with a registry error:

- `E401` means the shell is not authenticated; run `npm login` and verify with `npm whoami`.
- `E403 ... cannot be republished until 24 hours have passed` means the package name was recently unpublished and npm's waiting period has not expired.
- If the same `name@version` already existed, bump the version before publishing again.

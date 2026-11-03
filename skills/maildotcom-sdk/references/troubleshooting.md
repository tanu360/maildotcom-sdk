# Troubleshooting

## Auth And Sessions

- If login fails, confirm `MAILCOM_EMAIL` and `MAILCOM_PASSWORD` are present for the first login.
- If a valid cached session exists, the SDK can login without the password by loading the session.
- If a cached access token is invalid but a refresh token exists, the SDK refreshes and saves the new session.
- Authorized requests refresh once on 401 and retry. If the refresh token is rejected and a password is configured, the SDK clears the stale session, logs in with the password, and retries.
- Network failures during a cached refresh are rethrown and the stored session is kept; only a rejected refresh token is deleted.
- A corrupt session file is treated as missing and removed, so the next login falls back to the password.
- Wrong credentials throw `MailComAuthError` with "mail.com login failed. Check the account email and password."
- "mail.com blocked the login ... (HTTP 403)" means mail.com is rate-limiting logins, usually after repeated failures. Stop retrying and wait (often 15+ minutes) instead of looping.
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
- Prefer message IDs from `message.attribute?.mailIdentifier` when processing list/search results. Messages have no top-level `id` field.
- Empty or missing IDs throw `MailComValidationError` before any request is sent.

## Search And Folder Surprises

- `mail.search()` searches headers, not full message bodies.
- `mail.search()` excludes `TRASH`, `DRAFTS`, and `OUTBOX` by default.
- `excludeFolderTypeOrId` replaces those defaults. Passing `["SPAM"]` alone re-includes Trash, Drafts, and Outbox; use `[...DEFAULT_EXCLUDED_FOLDERS, "SPAM"]` or `NO_SPAM_EXCLUDED_FOLDERS`.
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
- Send, reply, and forward submission failures throw `MailComError` instances (`MailComApiError` for HTTP failures).
- `mail.reply()` needs `to` or `originalMail` (a message from list/search) so it can address the sender; mail.com has no single-message lookup endpoint for the SDK to fall back on.
- Total attachment bytes must stay under 25 MB.
- Always include filename, content type, and either `data` or `base64data` for attachments.
- For read receipts, use `dispositionNotificationTo`; this package does not expose a seen-timestamp field.

## Local SDK Development

Run this in the SDK repo:

```sh
npm test
```

The test script builds with TypeScript and runs Node's test runner against `dist/tests/*.test.js`.

## npm Publishing

If `npm publish` passes tests and packing but fails with a registry error:

- `E401` means the shell is not authenticated; run `npm login` and verify with `npm whoami`.
- npm records the publishing account's email in the public `maintainers` and `_npmUser` metadata of every version. Set the npm account email to the address you want public before publishing.
- `E403 ... cannot be republished until 24 hours have passed` means the package name was recently unpublished and npm's waiting period has not expired.
- If the same `name@version` already existed, bump the version before publishing again.

# Changelog

All notable changes to this package are documented here.

## 1.0.4 - 2026-05-29

- Normalize `/Folder/...` URI ids in `mail.listByFolder()` and `mail.syncFolder()`.
- Resolve empty draft create/update responses from the mail.com `Location` header instead of subject/recipient guessing.
- Share in-flight login and refresh calls so parallel cold-start requests do not start duplicate OAuth flows.
- Add submission UUID/idempotency metadata to plain `mail.send()` calls.
- Validate attachment inputs before sending so each attachment must include exactly one of `data` or `base64data`.
- Fall back to refresh-token login when cached token validation hits a network error.
- Surface mail.com API and submission error details in thrown error messages.
- Limit `mail.listIncoming()` folder reads to bounded concurrency to reduce burst traffic on accounts with many folders.

## 1.0.3 - 2026-05-28

- Added a reusable `maildotcom-sdk` agent skill for Codex, Claude Code, Cursor, GitHub Copilot, and other agents supported by the `skills` CLI.
- Added `skills.sh.json` metadata for the skills.sh repository page.
- Added agent-focused SDK guidance for auth, sessions, reading, search, polling, sending, drafts, actions, attachments, aliases, and troubleshooting.
- Documented skill installation commands in the README.

## 1.0.2 - 2026-05-28

- Added GitHub Actions CI for install, test, and package dry-run checks.

## 1.0.1 - 2026-05-27

- Added broad message discovery defaults for `mail.search()` and `mail.listIncoming()`.
- Included Spam and custom folders by default while keeping `TRASH`, `DRAFTS`, and `OUTBOX` excluded.
- Added explicit Spam exclusion examples with `excludeFolderTypeOrId` and `includeSpam`.
- Added `mail.listAll()`, `mail.findBySubject()`, and `mail.findBySender()` convenience helpers.
- Exported `DEFAULT_EXCLUDED_FOLDERS` and `NO_SPAM_EXCLUDED_FOLDERS` typed constants.
- Added GitHub Actions CI for install, test, and package dry-run checks.

## 1.0.0 - 2026-05-27

- Initial TypeScript SDK release.
- Added Android OAuth login, token refresh, validation, logout, and file-backed sessions.
- Added message search, folder listing, folder reads, previews, body fetches, sending, replies, forwards, drafts, actions, aliases, quota, settings, user data, recipient validation, and attachments.
- Added runnable examples and mocked unit tests.

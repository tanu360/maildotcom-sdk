# Changelog

All notable changes to this package are documented here.

## 1.0.1 - 2026-05-27

- Added broad message discovery defaults for `mail.search()` and `mail.listIncoming()`.
- Included Spam and custom folders by default while keeping `TRASH`, `DRAFTS`, and `OUTBOX` excluded.
- Added explicit Spam exclusion examples with `excludeFolderTypeOrId` and `includeSpam`.
- Added GitHub Actions CI for install, test, and package dry-run checks.

## 1.0.0 - 2026-05-27

- Initial TypeScript SDK release.
- Added Android OAuth login, token refresh, validation, logout, and file-backed sessions.
- Added message search, folder listing, folder reads, previews, body fetches, sending, replies, forwards, drafts, actions, aliases, quota, settings, user data, recipient validation, and attachments.
- Added runnable examples and mocked unit tests.

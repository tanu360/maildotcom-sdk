# Changelog

All notable changes to this package are documented here.

## 1.0.9 - 2026-08-07

- Migrated the web alias addon from the retired Wicket settings page to mail.com's current settings OAuth bridge and CATS APIs.
- Added live-domain discovery by intersecting mail.com's active-domain response with the exported `MAILCOM_ALIAS_DOMAINS` allowlist.
- Reworked alias creation and removal around the current REST resources, including availability checks, mutation verification, and non-deletable primary-address protection.
- Reworked default-sender selection around the current REST resource and preserved the `email` and `name-email` sender variants.

## 1.0.8 - 2026-06-27

- Added the optional `maildotcom-sdk/web-aliases` addon for web-only alias creation, deletion, and default-sender selection.
- Added `availableDomains()` and exported `MAILCOM_ALIAS_DOMAINS` for validating supported mail.com alias domains.
- Added the web alias example, API documentation, agent-skill guidance, and mocked coverage for the addon.

## 1.0.7 - 2026-06-03

- Bound cached sessions to normalized account emails so credentials cannot accidentally reuse another mailbox's token cache.
- Replaced email-derived session filenames with collision-resistant account hashes and restricted session directories/files to private permissions.
- Sanitized attachment filenames from service metadata to remove path components, null bytes, and unsafe special names.
- Updated documentation and examples to match the supported request parameters and SDK behavior.

## 1.0.6 - 2026-06-01

- Quoted and escaped default-sender display names containing RFC 5322 special characters before message submission.
- Ignored RFC 2483 comment lines when parsing `text/uri-list` folder responses.
- Expanded npm keywords for mail.com API and SDK discoverability.

## 1.0.5 - 2026-05-29

- Throw `MailComError` for mail.com submission error events and missing success events so send/reply/forward failures stay within the SDK error family.
- Escape search query condition separators so literal header searches such as `a:b` do not produce mail.com `400 Illegal condition` responses.

## 1.0.4 - 2026-05-29

- Normalize `/Folder/...` URI ids in `mail.listByFolder()` and `mail.syncFolder()`.
- Resolve empty draft create/update responses from the mail.com `Location` header instead of subject/recipient matching.
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

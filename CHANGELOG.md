# Changelog

All notable changes to this package are documented here.

## 2.0.0 - 2026-11-03

### Changed (may affect callers)

- `client.auth.login()` now rethrows network and unexpected errors from a cached refresh instead of deleting the stored session. Only a refresh token that mail.com rejects is cleared.
- Mail, folder, and attachment IDs are validated before any request. Missing, empty, or unparseable IDs, and empty ID lists for actions and previews, now throw `MailComValidationError`. Before, they threw a raw `TypeError` or sent a request that mail.com rejected with a 400.
- `MailComWebAliasAddon` API errors redact URL query strings in `message` and `url`, so navigator session IDs and OAuth state no longer leak into logs.

### Fixed

- Authorized requests that hit a 401 with a revoked or expired refresh token now fall back to password login (when a password is configured) and retry once, instead of failing until the process restarts.
- A wrong password now throws `MailComAuthError("mail.com login failed. Check the account email and password.")` in both the mobile client and the web alias addon. Before, it threw a misleading "Location header" or "Expected mail.com redirect" error.
- Login attempts that mail.com rate-limits (HTTP 403 "blocked" or 429) now say so, instead of reporting a missing redirect.
- `FileSessionStore` writes sessions through a temp file and rename, and treats a corrupt session file as missing so login can recover.
- The web alias addon opens a fresh settings session once and retries when the settings token expires (401). Concurrent addon calls now share one login.
- Web login form parsing decodes HTML entities exactly once, supports numeric entities, and no longer matches `data-name` or `data-value` attributes.

### Docs and agent skill

- Documented that `excludeFolderTypeOrId` replaces `DEFAULT_EXCLUDED_FOLDERS` rather than extending it.
- Documented that `mail.reply()` needs `to` or `originalMail`, and that list and search results expose IDs through `attribute.mailIdentifier`.
- Corrected the draft-resolution note in the API cheatsheet, which now resolves through the `Location` header.
- Expanded troubleshooting for credential errors, login rate limits, session recovery, and npm publishing metadata.

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

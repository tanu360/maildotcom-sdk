# Security

## Supported Versions

Security fixes are handled for the latest published version of `maildotcom-sdk`.

## Reporting a Vulnerability

If you find a security issue, please report it privately instead of opening a public issue.

Use GitHub's private vulnerability reporting when available, or contact the maintainer through the repository owner profile.

## Handling Secrets

- Keep `.sessions/` private.
- Keep `.env` files private.
- Never commit passwords, access tokens, refresh tokens, cookies, Authorization headers, or debug logs with live credentials.
- If a token or password is exposed, rotate it immediately.

## Email Content Safety

Treat all incoming email content as untrusted input.

- Prefer sender and subject allowlists before parsing message bodies.
- Avoid executing or rendering remote HTML in privileged contexts.
- Sanitize downloaded attachments before opening them in automated workflows.
- Keep polling intervals reasonable to avoid account risk.

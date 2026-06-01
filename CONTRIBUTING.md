# Contributing

Thanks for helping improve `maildotcom-sdk`.

## Setup

```bash
npm install
npm test
```

The project uses TypeScript, native `fetch`, ESM output, and Node.js 20+.

## Development

- Keep SDK behavior small, typed, and easy to reason about.
- Prefer supported mail.com mobile API request shapes.
- Do not add unsupported request parameters.
- Keep public APIs using plain IDs such as `mailId`, `folderId`, and `attachmentId`.
- Add or update tests for request payloads, ID normalization, parsing, and safety checks.
- Keep examples runnable with environment variables and safe defaults.

## Before Opening a Pull Request

Run:

```bash
npm test
npm pack --dry-run
```

## Safety Rules

- Do not commit `.sessions/`, `.env`, cookies, or tokens.
- Do not include real credentials in examples, tests, issues, or pull requests.
- Sanitize debug logs before sharing them.

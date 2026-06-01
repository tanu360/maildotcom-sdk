import { compactMessage, loginFromEnv, mailId, numberEnv, printJson } from "./_shared.js";

const client = await loginFromEnv();

// Workflow: wait for a trusted message and extract a short numeric code.
//
// SDK calls used:
// - mail.listIncoming() checks all non-excluded folders, including custom folders.
// - mail.getPreview(mailId) checks a fast snippet without marking read.
// - mail.getBody(mailId) fetches the full body and marks the message read by default.
//
// This is intentionally a workflow example that composes existing SDK calls.
// It uses only supported SDK primitives and filters untrusted messages before parsing.
//
// Env:
// - MAILCOM_CODE_FROM: trusted sender substring, default "sender@example.com".
// - MAILCOM_CODE_SUBJECT: trusted subject substring, default "code".
// - MAILCOM_CODE_TO: optional recipient substring to match the To header.
// - MAILCOM_CODE_TIMEOUT_MS: total wait time, default 60000.
// - MAILCOM_CODE_POLL_INTERVAL_MS: polling delay, default 3000. Keep this >= 3000.
// - MAILCOM_CODE_AMOUNT: number of recent messages per poll, default 25.
// - MAILCOM_CODE_MARK_READ: whether getBody marks the matched message read, default true.

const senderFilter = process.env.MAILCOM_CODE_FROM ?? "sender@example.com";
const subjectFilter = process.env.MAILCOM_CODE_SUBJECT ?? "code";
const toFilter = process.env.MAILCOM_CODE_TO;
const timeoutMs = numberEnv("MAILCOM_CODE_TIMEOUT_MS", 60_000);
const pollIntervalMs = Math.max(numberEnv("MAILCOM_CODE_POLL_INTERVAL_MS", 3_000), 3_000);
const amount = numberEnv("MAILCOM_CODE_AMOUNT", 25);
const markRead = process.env.MAILCOM_CODE_MARK_READ !== "false";
const startedAt = Date.now();

while (Date.now() - startedAt < timeoutMs) {
  const incoming = await client.mail.listIncoming({
    amount,
    includeSpam: true,
    tagsShowAll: true,
  });

  const candidates = incoming.mail.filter((message) => {
    const from = message.mailHeader?.from ?? "";
    const subject = message.mailHeader?.subject ?? "";
    const recipients = message.mailHeader?.to ?? [];

    if (!from.toLowerCase().includes(senderFilter.toLowerCase())) return false;
    if (!subject.toLowerCase().includes(subjectFilter.toLowerCase())) return false;
    if (toFilter && !recipients.some((recipient) => recipient.toLowerCase().includes(toFilter.toLowerCase()))) return false;
    return true;
  });

  for (const message of candidates) {
    const id = mailId(message);
    if (!id) continue;

    const subjectCode = extractVerificationCode(message.mailHeader?.subject ?? "");
    if (subjectCode) {
      printJson("messageCode.found", {
        code: subjectCode,
        source: "subject",
        message: compactMessage(message),
      });
      process.exit(0);
    }

    const preview = await client.mail.getPreview(id);
    const previewCode = extractVerificationCode(preview.map((item) => item.preview).join(" "));
    if (previewCode) {
      printJson("messageCode.found", {
        code: previewCode,
        source: "preview",
        message: compactMessage(message),
      });
      process.exit(0);
    }

    const body = await client.mail.getBody(id, { format: "html", markRead });
    const bodyCode = extractVerificationCode(body);
    if (bodyCode) {
      printJson("messageCode.found", {
        code: bodyCode,
        source: "body",
        markedRead: markRead,
        message: compactMessage(message),
      });
      process.exit(0);
    }
  }

  await sleep(pollIntervalMs);
}

throw new Error(`No matching code found within ${timeoutMs}ms.`);

function extractVerificationCode(input: string): string | null {
  const text = htmlToSearchableText(input);
  const contextMatch = text.match(/(?:code|otp|pin|verification|temporary)[^\d]{0,80}(\d[\d\s-]{3,14}\d)/i);
  const fallbackMatch = text.match(/\b(\d{4,8})\b/);
  const raw = contextMatch?.[1] ?? fallbackMatch?.[1];
  return raw ? raw.replace(/\D/g, "") : null;
}

function htmlToSearchableText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_match, codepoint: string) => String.fromCodePoint(Number(codepoint)))
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

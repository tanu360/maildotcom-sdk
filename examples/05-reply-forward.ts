import { compactObject, env, loginFromEnv, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Reply and forward methods covered here:
// - client.mail.reply(input)
//   params: originalMailId, htmlBody, to, from, cc, bcc, subject, attachments, priority, date, uuid, originalMail.
//   If originalMail is provided, the SDK can infer reply to/subject from it.
// - client.mail.forward(input)
//   params: originalMailId, from, to, cc, bcc, subject, htmlBody, attachments, priority, date, uuid, originalMail.

const originalMailId =
  env("MAILCOM_ORIGINAL_MAIL_ID") ?? env("MAILCOM_ORIGINAL_ID") ?? skip("MAILCOM_ORIGINAL_MAIL_ID is required.");
const mode = env("MAILCOM_REPLY_FORWARD_MODE", "reply");

if (mode === "forward") {
  const result = await client.mail.forward(compactObject({
    originalMailId,
    from: env("MAILCOM_FROM"),
    to: env("MAILCOM_TO") ?? skip("MAILCOM_TO is required for forward.", ["MAILCOM_TO"]),
    cc: env("MAILCOM_CC"),
    bcc: env("MAILCOM_BCC"),
    subject: env("MAILCOM_SUBJECT", "Fwd:"),
    htmlBody: env("MAILCOM_HTML_BODY", "<html><body>Forwarding this message from the SDK.</body></html>"),
    priority: env("MAILCOM_PRIORITY", "3"),
    uuid: env("MAILCOM_SUBMISSION_UUID"),
  }));
  printJson("mail.forward", result);
} else {
  const result = await client.mail.reply(compactObject({
    originalMailId,
    from: env("MAILCOM_FROM"),
    to: env("MAILCOM_TO") ?? skip("MAILCOM_TO is required for this standalone reply example.", ["MAILCOM_TO"]),
    cc: env("MAILCOM_CC"),
    bcc: env("MAILCOM_BCC"),
    subject: env("MAILCOM_SUBJECT", "Re:"),
    htmlBody: env("MAILCOM_HTML_BODY", "<html><body>Replying from the SDK.</body></html>"),
    priority: env("MAILCOM_PRIORITY", "3"),
    uuid: env("MAILCOM_SUBMISSION_UUID"),
  }));
  printJson("mail.reply", result);
}

import { attachmentInputsFromEnv, compactObject, env, loginFromEnv, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Send method covered here:
// - client.mail.send(input)
//
// Confirmed input params:
// - from: optional sender string. Supports "Display Name <address@mail.com>".
// - to: required string or string[].
// - cc, bcc: optional string or string[].
// - subject: optional string.
// - htmlBody: required HTML body string.
// - attachments: optional [{ filename, contentType, data | base64data }], max total size 25 MB.
// - priority: optional mail.com priority string; default is "3".
// - date: optional millisecond timestamp; default is Date.now().
// - dispositionNotificationTo: optional address or addresses for read receipt requests.
// - uuid: optional transient submission UUID.

const to = env("MAILCOM_TO") ?? skip("MAILCOM_TO is required to send mail.", ["MAILCOM_TO"]);
const attachments = await attachmentInputsFromEnv();

const result = await client.mail.send(compactObject({
  from: env("MAILCOM_FROM"),
  to,
  cc: env("MAILCOM_CC"),
  bcc: env("MAILCOM_BCC"),
  subject: env("MAILCOM_SUBJECT", "Hello from maildotcom-sdk"),
  htmlBody:
    env("MAILCOM_HTML_BODY") ??
    "<html><body><h1>Hello</h1><p>This rich HTML email was sent by maildotcom-sdk.</p></body></html>",
  attachments,
  priority: env("MAILCOM_PRIORITY", "3"),
  dispositionNotificationTo: env("MAILCOM_READ_RECEIPT_TO"),
  uuid: env("MAILCOM_SUBMISSION_UUID"),
}));

printJson("mail.send", result);

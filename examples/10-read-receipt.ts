import { boolEnv, compactObject, env, loginFromEnv, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Workflow: request a read receipt on outgoing mail.
//
// Supported behavior:
// - mail.send supports dispositionNotificationTo in the submitted mail header.
// - This SDK does not expose a direct "seen timestamp" field.
// - If the recipient/app sends a receipt, it arrives as a normal email and can be found with search/listIncoming.
//
// Env:
// - MAILCOM_TO: required recipient.
// - MAILCOM_READ_RECEIPT_TO: optional receipt address. Defaults to MAILCOM_EMAIL.
// - MAILCOM_SEARCH_RECEIPTS=true: also run a header search after sending.

const to = env("MAILCOM_TO") ?? skip("MAILCOM_TO is required.", ["MAILCOM_TO"]);
const receiptTo = env("MAILCOM_READ_RECEIPT_TO") ?? env("MAILCOM_EMAIL");

const sent = await client.mail.send(compactObject({
  from: env("MAILCOM_FROM"),
  to,
  subject: env("MAILCOM_SUBJECT", "Read receipt test from maildotcom-sdk"),
  htmlBody:
    env("MAILCOM_HTML_BODY") ??
    "<html><body><p>This message asks the recipient client for a read receipt.</p></body></html>",
  dispositionNotificationTo: receiptTo,
}));
printJson("workflow.readReceipt.send", sent);

if (boolEnv("MAILCOM_SEARCH_RECEIPTS")) {
  const query = env("MAILCOM_RECEIPT_SEARCH", "read");
  printJson("workflow.readReceipt.search", await client.mail.search(query, { amount: 10 }));
}

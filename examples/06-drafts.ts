import { boolEnv, compactObject, env, loginFromEnv, mailId, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Draft methods covered here:
// - client.drafts.list(): lists Drafts folder messages.
// - client.drafts.create(input): same message input shape as send, saved to Drafts.
// - client.drafts.update(draftId, input): replaces an existing draft.
// - client.drafts.delete(mailIds): moves one or many drafts to Trash.
//
// Draft create/update input params:
// - from, to, cc, bcc, subject, htmlBody, attachments, priority, date, dispositionNotificationTo.
//
// Draft create/update can return an empty 201 body from mail.com. The SDK resolves the written draft
// by refetching Drafts, which is the confirmed working behavior.

const before = await client.drafts.list();
printJson("drafts.list.before", before);

if (!boolEnv("MAILCOM_CREATE_DRAFT")) {
  skip("Set MAILCOM_CREATE_DRAFT=true to create a draft.", ["MAILCOM_CREATE_DRAFT"]);
}

const created = await client.drafts.create(compactObject({
  from: env("MAILCOM_FROM"),
  to: env("MAILCOM_TO") ?? skip("MAILCOM_TO is required for draft create.", ["MAILCOM_TO"]),
  cc: env("MAILCOM_CC"),
  bcc: env("MAILCOM_BCC"),
  subject: env("MAILCOM_SUBJECT", "Draft from maildotcom-sdk"),
  htmlBody: env("MAILCOM_HTML_BODY", "<html><body>Draft body from the SDK.</body></html>"),
  priority: env("MAILCOM_PRIORITY", "3"),
}));
printJson("drafts.create", created);

const draftId = env("MAILCOM_UPDATE_DRAFT_ID") ?? mailId(created);
if (boolEnv("MAILCOM_UPDATE_CREATED_DRAFT") && draftId) {
  printJson(
    "drafts.update",
    await client.drafts.update(draftId, compactObject({
      from: env("MAILCOM_FROM"),
      to: env("MAILCOM_TO") ?? skip("MAILCOM_TO is required for draft update.", ["MAILCOM_TO"]),
      subject: env("MAILCOM_UPDATED_SUBJECT", "Updated draft from maildotcom-sdk"),
      htmlBody: env("MAILCOM_UPDATED_HTML_BODY", "<html><body>Updated draft body.</body></html>"),
      priority: env("MAILCOM_PRIORITY", "3"),
    })),
  );
}

const deleteId = env("MAILCOM_DELETE_DRAFT_ID") ?? (boolEnv("MAILCOM_DELETE_CREATED_DRAFT") ? draftId : undefined);
if (deleteId) {
  printJson("drafts.delete", await client.drafts.delete(deleteId));
}

import { boolEnv, env, folderByType, folderId, loginFromEnv, numberEnv, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Workflow: create a user folder, rename it, set expiry, move one mail into it,
// move the mail back to Inbox, then delete the temporary folder.
//
// SDK calls used:
// - folders.create, folders.rename, folders.setExpireDays, folders.delete.
// - actions.moveToFolder.
// - mail.listByFolder for verification.
//
// This mutates mailbox state. It only runs with MAILCOM_RUN_FOLDER_MAIL_LIFECYCLE=true.

if (!boolEnv("MAILCOM_RUN_FOLDER_MAIL_LIFECYCLE")) {
  skip("Set MAILCOM_RUN_FOLDER_MAIL_LIFECYCLE=true to run this mutation workflow.", [
    "MAILCOM_RUN_FOLDER_MAIL_LIFECYCLE",
  ]);
}

const mailId = env("MAILCOM_MAIL_ID") ?? skip("MAILCOM_MAIL_ID is required.", ["MAILCOM_MAIL_ID"]);
const folders = await client.folders.list();
const inboxId = env("MAILCOM_RETURN_FOLDER_ID") ?? folderId(folderByType(folders, "INBOX"));
if (!inboxId) skip("No Inbox folder ID available. Set MAILCOM_RETURN_FOLDER_ID.");

const created = await client.folders.create(env("MAILCOM_WORKFLOW_FOLDER_NAME", `sdk-temp-${Date.now()}`));
const createdId = folderId(created) ?? skip("Created folder response did not include folderIdentifier.");
printJson("workflow.folder.create", created);

const renamed = await client.folders.rename(createdId, env("MAILCOM_WORKFLOW_RENAME_TO", `sdk-temp-renamed-${Date.now()}`));
printJson("workflow.folder.rename", renamed);

const expireDays = numberEnv("MAILCOM_WORKFLOW_EXPIRE_DAYS", 1);
printJson("workflow.folder.setExpireDays", await client.folders.setExpireDays(createdId, expireDays));

printJson("workflow.mail.moveToTempFolder", await client.actions.moveToFolder(mailId, createdId));
printJson("workflow.tempFolder.list", await client.mail.listByFolder(createdId, { amount: 10, tagsShowAll: true }));

printJson("workflow.mail.moveBack", await client.actions.moveToFolder(mailId, inboxId));
await client.folders.delete(createdId);
printJson("workflow.folder.delete", { folderId: createdId, deleted: true });

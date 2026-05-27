import { csvEnv, env, loginFromEnv, printJson, skip, boolEnv } from "./_shared.js";

const client = await loginFromEnv();

// Mail action methods covered here:
// - client.actions.markRead(mailIds)
// - client.actions.markUnread(mailIds)
// - client.actions.star(mailIds)
// - client.actions.unstar(mailIds)
// - client.actions.markSpam(mailIds)
// - client.actions.markNotSpam(mailIds)
// - client.actions.moveToFolder(mailIds, folderId)
// - client.actions.moveToTrash(mailIds)
// - client.actions.deletePermanent(mailIds)
// - client.actions.emptyTrash()
//
// mailIds accepts a single ID or an array. This example reads MAILCOM_MAIL_IDS as comma-separated IDs.
// MAILCOM_ACTION values: mark-read, mark-unread, star, unstar, spam, not-spam, move, trash,
// delete-permanent, empty-trash. The move action also needs MAILCOM_TARGET_FOLDER_ID.

const action = env("MAILCOM_ACTION") ?? skip("MAILCOM_ACTION is required.", ["MAILCOM_ACTION"]);
const mailIds = csvEnv("MAILCOM_MAIL_IDS");

if (action !== "empty-trash" && mailIds.length === 0) {
  skip("MAILCOM_MAIL_IDS is required for this action.", ["MAILCOM_MAIL_IDS"]);
}

if ((action === "delete-permanent" || action === "empty-trash") && !boolEnv("MAILCOM_CONFIRM_DESTRUCTIVE")) {
  skip("Set MAILCOM_CONFIRM_DESTRUCTIVE=true for permanent delete or empty trash.", ["MAILCOM_CONFIRM_DESTRUCTIVE"]);
}

switch (action) {
  case "mark-read":
    printJson("actions.markRead", await client.actions.markRead(mailIds));
    break;
  case "mark-unread":
    printJson("actions.markUnread", await client.actions.markUnread(mailIds));
    break;
  case "star":
    printJson("actions.star", await client.actions.star(mailIds));
    break;
  case "unstar":
    printJson("actions.unstar", await client.actions.unstar(mailIds));
    break;
  case "spam":
    printJson("actions.markSpam", await client.actions.markSpam(mailIds));
    break;
  case "not-spam":
    printJson("actions.markNotSpam", await client.actions.markNotSpam(mailIds));
    break;
  case "move": {
    const targetFolderId = env("MAILCOM_TARGET_FOLDER_ID") ?? skip("MAILCOM_TARGET_FOLDER_ID is required.");
    printJson("actions.moveToFolder", await client.actions.moveToFolder(mailIds, targetFolderId));
    break;
  }
  case "trash":
    printJson("actions.moveToTrash", await client.actions.moveToTrash(mailIds));
    break;
  case "delete-permanent":
    await client.actions.deletePermanent(mailIds);
    printJson("actions.deletePermanent", { mailIds, deleted: true });
    break;
  case "empty-trash":
    await client.actions.emptyTrash();
    printJson("actions.emptyTrash", { emptied: true });
    break;
  default:
    throw new Error(`Unknown MAILCOM_ACTION: ${action}`);
}

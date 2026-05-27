import { boolEnv, env, folderId, loginFromEnv, numberEnv, printJson, skip } from "./_shared.js";

const client = await loginFromEnv();

// Folder methods covered here:
// - client.folders.list(): returns all system and user folders.
// - client.folders.create(input): accepts a folder name string or { name, folderType }.
// - client.folders.rename(folderId, name): renames a folder.
// - client.folders.move(folderId, parentFolderId): moves a folder under another folder.
// - client.folders.setExpireDays(folderId, days): sets mail.com folder expiry days.
// - client.folders.delete(folderId): deletes a folder. Use only for user-created folders.

const folders = await client.folders.list();
printJson("folders.list", folders);

const createName = env("MAILCOM_CREATE_FOLDER_NAME");
if (!createName) {
  skip("Set MAILCOM_CREATE_FOLDER_NAME to run the folder mutation example.", ["MAILCOM_CREATE_FOLDER_NAME"]);
}

const created = await client.folders.create({
  name: createName,
  folderType: env("MAILCOM_CREATE_FOLDER_TYPE", "USER_DEFINED"),
});
printJson("folders.create", created);

const createdId = folderId(created) ?? skip("Created folder response did not include folderIdentifier.");

const renameTo = env("MAILCOM_RENAME_FOLDER_TO");
if (renameTo) {
  printJson("folders.rename", await client.folders.rename(createdId, renameTo));
}

const expireDays = numberEnv("MAILCOM_FOLDER_EXPIRE_DAYS");
if (expireDays !== undefined) {
  printJson("folders.setExpireDays", await client.folders.setExpireDays(createdId, expireDays));
}

const parentFolderId = env("MAILCOM_PARENT_FOLDER_ID");
if (parentFolderId) {
  printJson("folders.move", await client.folders.move(createdId, parentFolderId));
}

if (boolEnv("MAILCOM_DELETE_CREATED_FOLDER")) {
  await client.folders.delete(createdId);
  printJson("folders.delete", { folderId: createdId, deleted: true });
}


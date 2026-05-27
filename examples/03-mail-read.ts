import {
  boolEnv,
  compactMessage,
  csvEnv,
  env,
  folderByType,
  folderId,
  loginFromEnv,
  mailId,
  numberEnv,
  printJson,
  skip,
} from "./_shared.js";
import { NO_SPAM_EXCLUDED_FOLDERS } from "../src/index.js";

const client = await loginFromEnv();

// Mail read methods covered here:
// - client.mail.listIncoming(options): lists all mail.
// - client.mail.listAll(options): alias for listIncoming.
//   options: amount, orderBy, condition, tagsShowAll, excludeFolderTypeOrId, includeSpam.
//   Default excludes TRASH, DRAFTS, OUTBOX and includes custom folders.
// - client.mail.listByFolder(folderId, options): lists a single folder.
//   options: amount, orderBy, condition, tagsShowAll, format ("messages" or "uris").
// - client.mail.syncFolder(folderId, options): returns changed mail IDs using after/date or condition.
//   options: after, condition, orderBy.
// - client.mail.search(query, options): header search across from/replyTo/cc/bcc/to/subject.
//   options: amount, excludeFolderTypeOrId, orderBy.
//   Default excludes TRASH, DRAFTS, OUTBOX and includes Spam/custom folders.
// - client.mail.findBySubject(subject, options): header search plus local subject filtering.
// - client.mail.findBySender(sender, options): header search plus local sender filtering.
// - client.mail.getPreview(mailIds): fast preview for one or many mail IDs; does not mark read.
// - client.mail.getBody(mailId, options): full body; marks read unless markRead is false.
//   options: format ("html" or "text"), markRead.

const amount = numberEnv("MAILCOM_AMOUNT", 10);
const excludedFolderTypeOrId = csvEnv("MAILCOM_EXCLUDE_FOLDER_TYPE_OR_ID");
const incoming = await client.mail.listIncoming({
  amount,
  ...(excludedFolderTypeOrId.length > 0 ? { excludeFolderTypeOrId: excludedFolderTypeOrId } : {}),
  includeSpam: boolEnv("MAILCOM_INCLUDE_SPAM", true),
  tagsShowAll: true,
});

printJson(
  "mail.listIncoming",
  {
    totalCount: incoming.totalCount,
    unreadCount: incoming.unreadCount,
    folders: incoming.folders,
    mail: incoming.mail.slice(0, 10).map(compactMessage),
  },
);

const folders = await client.folders.list();
const defaultFolderId = folderId(folderByType(folders, "INBOX"));
const selectedFolderId = env("MAILCOM_FOLDER_ID") ?? defaultFolderId;
if (!selectedFolderId) skip("No folder ID available for listByFolder.", ["MAILCOM_FOLDER_ID"]);

const listFormat = boolEnv("MAILCOM_LIST_AS_URIS") ? "uris" : "messages";
const folderMessages = await client.mail.listByFolder(selectedFolderId, {
  amount,
  tagsShowAll: true,
  format: listFormat,
});
printJson("mail.listByFolder", folderMessages);

const syncMinutes = numberEnv("MAILCOM_SYNC_LAST_MINUTES", 30);
const syncAfter = new Date(Date.now() - syncMinutes * 60_000);
printJson("mail.syncFolder", await client.mail.syncFolder(selectedFolderId, { after: syncAfter }));

const query = env("MAILCOM_SEARCH");
if (query) {
  const searchExcludedFolderTypeOrId = csvEnv("MAILCOM_SEARCH_EXCLUDE_FOLDER_TYPE_OR_ID");
  const searchOptions = searchExcludedFolderTypeOrId.length > 0
    ? { amount, excludeFolderTypeOrId: searchExcludedFolderTypeOrId }
    : boolEnv("MAILCOM_SEARCH_EXCLUDE_SPAM")
      ? { amount, excludeFolderTypeOrId: NO_SPAM_EXCLUDED_FOLDERS }
    : { amount };
  printJson("mail.search", await client.mail.search(query, searchOptions));
}

const findSubject = env("MAILCOM_FIND_SUBJECT");
if (findSubject) {
  printJson(
    "mail.findBySubject",
    (await client.mail.findBySubject(findSubject, { amount })).map(compactMessage),
  );
}

const findSender = env("MAILCOM_FIND_SENDER");
if (findSender) {
  printJson(
    "mail.findBySender",
    (await client.mail.findBySender(findSender, { amount })).map(compactMessage),
  );
}

const previewIds = csvEnv("MAILCOM_PREVIEW_MAIL_IDS");
const firstIncomingId = mailId(incoming.mail[0]);
const idsForPreview = previewIds.length > 0 ? previewIds : firstIncomingId ? [firstIncomingId] : [];
if (idsForPreview.length > 0) {
  printJson("mail.getPreview", await client.mail.getPreview(idsForPreview));
}

const bodyMailId = env("MAILCOM_BODY_MAIL_ID");
if (bodyMailId || boolEnv("MAILCOM_READ_FIRST_BODY")) {
  const selectedMailId = bodyMailId ?? firstIncomingId ?? skip("No mail ID available for getBody.");
  const body = await client.mail.getBody(selectedMailId, {
    format: env("MAILCOM_BODY_FORMAT", "html") === "text" ? "text" : "html",
    markRead: boolEnv("MAILCOM_BODY_MARK_READ", true),
  });

  printJson("mail.getBody", {
    mailId: selectedMailId,
    length: body.length,
    preview: body.slice(0, 500),
  });
}

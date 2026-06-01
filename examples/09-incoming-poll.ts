import { boolEnv, compactMessage, csvEnv, loginFromEnv, numberEnv, printJson } from "./_shared.js";

const client = await loginFromEnv();

// Workflow: lightweight polling across all mail.
//
// SDK calls used:
// - mail.listIncoming() checks all non-excluded folders, including custom folders.
// - mail.syncFolder(folderId, { after }) returns IDs newer than a timestamp.
// - mail.getPreview(ids) can fetch snippets without marking messages read.
//
// Useful env:
// - MAILCOM_POLL_ITERATIONS: loop count, default 1.
// - MAILCOM_POLL_INTERVAL_MS: delay between loops, default 3000.
// - MAILCOM_POLL_LAST_MINUTES: sync window, default 5.
// - MAILCOM_EXCLUDE_FOLDER_TYPE_OR_ID: comma-separated folder types or IDs to skip.
// - MAILCOM_INCLUDE_SPAM: set false to skip Spam, default true.
// - MAILCOM_PREVIEW_NEW: fetch previews for new IDs, default false.

const iterations = numberEnv("MAILCOM_POLL_ITERATIONS", 1);
const intervalMs = numberEnv("MAILCOM_POLL_INTERVAL_MS", 3000);
const lastMinutes = numberEnv("MAILCOM_POLL_LAST_MINUTES", 5);
const excludedFolderTypeOrId = csvEnv("MAILCOM_EXCLUDE_FOLDER_TYPE_OR_ID");

for (let index = 0; index < iterations; index += 1) {
  const incoming = await client.mail.listIncoming({
    amount: numberEnv("MAILCOM_AMOUNT", 25),
    ...(excludedFolderTypeOrId.length > 0 ? { excludeFolderTypeOrId: excludedFolderTypeOrId } : {}),
    includeSpam: boolEnv("MAILCOM_INCLUDE_SPAM", true),
    tagsShowAll: true,
  });

  const after = new Date(Date.now() - lastMinutes * 60_000);
  const sync = await Promise.all(
    incoming.folders.map(async (folder) => ({
      folder,
      ...(await client.mail.syncFolder(folder.folderIdentifier, { after })),
    })),
  );
  const newIds = sync.flatMap((item) => item.mailIds);

  printJson(`poll.${index + 1}`, {
    unreadCount: incoming.unreadCount,
    latest: incoming.mail.slice(0, 10).map(compactMessage),
    sync,
  });

  if (boolEnv("MAILCOM_PREVIEW_NEW") && newIds.length > 0) {
    printJson(`poll.${index + 1}.previews`, await client.mail.getPreview(newIds));
  }

  if (index + 1 < iterations) await sleep(intervalMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

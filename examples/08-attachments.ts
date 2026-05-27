import {
  attachmentId,
  boolEnv,
  compactAttachment,
  compactMessage,
  env,
  loginFromEnv,
  mailId,
  printJson,
  saveBinaryOutput,
} from "./_shared.js";
import type { MailMessage } from "../src/index.js";

const client = await loginFromEnv();

// Attachment methods covered here:
// - client.attachments.listFromMessage(message): extracts attachment metadata from a message object.
// - client.attachments.download(mailId, attachmentId): downloads the original attachment.
// - client.attachments.thumbnail(mailId, attachmentId, options): downloads a JPG thumbnail.
//   thumbnail options: width, height.
//
// Env:
// - MAILCOM_MAIL_ID and MAILCOM_ATTACHMENT_ID target a specific attachment.
// - MAILCOM_FOLDER_ID searches a specific folder; otherwise the example scans all mail.
// - MAILCOM_DOWNLOAD_ATTACHMENT=true downloads the original file.
// - MAILCOM_DOWNLOAD_THUMBNAIL=true downloads a thumbnail.
// - MAILCOM_SAVE_ATTACHMENTS=true writes downloads to MAILCOM_OUTPUT_DIR.

const targetMailId = env("MAILCOM_MAIL_ID");
const explicitAttachmentId = env("MAILCOM_ATTACHMENT_ID");
let message: MailMessage | undefined;

const folder = env("MAILCOM_FOLDER_ID");
if (folder) {
  const listed = await client.mail.listByFolder(folder, { amount: 50, tagsShowAll: true, format: "messages" });
  if ("mail" in listed) {
    message = targetMailId
      ? listed.mail?.find((item) => mailId(item) === targetMailId)
      : listed.mail?.find((item) => client.attachments.listFromMessage(item).length > 0);
  }
} else {
  const incoming = await client.mail.listIncoming({ amount: 50, includeSpam: true, tagsShowAll: true });
  message = targetMailId
    ? incoming.mail.find((item) => mailId(item) === targetMailId)
    : incoming.mail.find((item) => client.attachments.listFromMessage(item).length > 0);
}

if (message) {
  printJson("attachments.message", compactMessage(message));
  printJson("attachments.listFromMessage", client.attachments.listFromMessage(message).map(compactAttachment));
}

const selectedMailId = targetMailId ?? mailId(message);
const selectedAttachment =
  explicitAttachmentId ?? attachmentId(message ? client.attachments.listFromMessage(message)[0] : undefined);

if (!selectedMailId || !selectedAttachment) {
  printJson("attachments.note", {
    message: "Set MAILCOM_MAIL_ID and MAILCOM_ATTACHMENT_ID to download a specific attachment.",
    foundMessageId: selectedMailId,
    foundAttachmentId: selectedAttachment,
  });
  process.exit(0);
}

if (boolEnv("MAILCOM_DOWNLOAD_ATTACHMENT")) {
  const downloaded = await client.attachments.download(selectedMailId, selectedAttachment);
  const output = boolEnv("MAILCOM_SAVE_ATTACHMENTS")
    ? await saveBinaryOutput(env("MAILCOM_OUTPUT_DIR", ".examples-output"), downloaded.filename ?? "attachment.bin", downloaded.data)
    : undefined;

  printJson("attachments.download", {
    mailId: selectedMailId,
    attachmentId: selectedAttachment,
    contentType: downloaded.contentType,
    filename: downloaded.filename,
    byteLength: downloaded.data.byteLength,
    output,
  });
}

if (boolEnv("MAILCOM_DOWNLOAD_THUMBNAIL")) {
  const thumbnail = await client.attachments.thumbnail(selectedMailId, selectedAttachment, {
    width: Number(env("MAILCOM_THUMBNAIL_WIDTH", "160")),
    height: Number(env("MAILCOM_THUMBNAIL_HEIGHT", "160")),
  });
  const output = boolEnv("MAILCOM_SAVE_ATTACHMENTS")
    ? await saveBinaryOutput(env("MAILCOM_OUTPUT_DIR", ".examples-output"), thumbnail.filename ?? "thumbnail.jpg", thumbnail.data)
    : undefined;

  printJson("attachments.thumbnail", {
    mailId: selectedMailId,
    attachmentId: selectedAttachment,
    contentType: thumbnail.contentType,
    filename: thumbnail.filename,
    byteLength: thumbnail.data.byteLength,
    output,
  });
}

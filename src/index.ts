export { MailComClient } from "./client.js";
export { MailComApiError, MailComAuthError, MailComError, MailComValidationError } from "./errors.js";
export { FileSessionStore, MemorySessionStore } from "./session-store.js";
export { parseMailSubmissionResult, parseSse, parseSseJsonData } from "./sse.js";
export { folderUri, mailUri, normalizeAttachmentId, normalizeFolderId, normalizeMailId, parseUriList } from "./id.js";
export { DEFAULT_EXCLUDED_FOLDERS, MAX_TOTAL_ATTACHMENT_BYTES, NO_SPAM_EXCLUDED_FOLDERS } from "./constants.js";
export type * from "./types.js";

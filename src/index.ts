export { MailComClient } from "./client.js";
export { MailComApiError, MailComAuthError, MailComError, MailComValidationError } from "./errors.js";
export { FileSessionStore, MemorySessionStore } from "./session-store.js";
export { parseMailSubmissionResult, parseSse, parseSseJsonData } from "./sse.js";
export { folderUri, mailUri, normalizeAttachmentId, normalizeFolderId, normalizeMailId, parseUriList } from "./id.js";
export type * from "./types.js";

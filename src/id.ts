import { MailComValidationError } from "./errors.js";

export function normalizeMailId(input: string): string {
  const decoded = safeDecode(requireIdInput(input, "mail ID"));
  const match = decoded.match(/(?:^|\/)Mail\/([^/?#]+)/);
  if (match?.[1]) return match[1];
  return requireNormalized(decoded.replace(/^(\.\.\/)*Mail\//, "").replace(/^\/+/, ""), input, "mail ID");
}

export function normalizeAttachmentId(input: string): string {
  const decoded = safeDecode(requireIdInput(input, "attachment ID"));
  const match = decoded.match(/(?:^|\/)Attachment\/([^/?#]+)/);
  if (match?.[1]) return match[1];
  return requireNormalized(decoded.replace(/^(\.\.\/)*Attachment\//, "").replace(/^\/+/, ""), input, "attachment ID");
}

export function normalizeFolderId(input: string): string {
  const decoded = safeDecode(requireIdInput(input, "folder ID"));
  const match = decoded.match(/(?:^|\/)Folder\/([^/?#]+)/);
  if (match?.[1]) return match[1];
  return requireNormalized(decoded.replace(/^(\.\.\/)*Folder\//, "").replace(/^\/+/, ""), input, "folder ID");
}

export function mailUri(mailId: string): string {
  return `../../Mail/${normalizeMailId(mailId)}`;
}

export function folderUri(folderId: string): string {
  return `/Folder/${normalizeFolderId(folderId)}`;
}

export function parseUriList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map(normalizeMailId);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function requireIdInput(input: unknown, label: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new MailComValidationError(`Expected a non-empty ${label}, got ${input === "" ? "an empty string" : String(input)}.`);
  }
  return input.trim();
}

function requireNormalized(value: string, input: string, label: string): string {
  if (!value) throw new MailComValidationError(`Could not parse ${label} from ${JSON.stringify(input)}.`);
  return value;
}

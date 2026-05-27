export function normalizeMailId(input: string): string {
  const decoded = safeDecode(input.trim());
  const match = decoded.match(/(?:^|\/)Mail\/([^/?#]+)/);
  if (match?.[1]) return match[1];
  return decoded.replace(/^(\.\.\/)*Mail\//, "").replace(/^\/+/, "");
}

export function normalizeAttachmentId(input: string): string {
  const decoded = safeDecode(input.trim());
  const match = decoded.match(/(?:^|\/)Attachment\/([^/?#]+)/);
  if (match?.[1]) return match[1];
  return decoded.replace(/^(\.\.\/)*Attachment\//, "").replace(/^\/+/, "");
}

export function normalizeFolderId(input: string): string {
  const decoded = safeDecode(input.trim());
  const match = decoded.match(/(?:^|\/)Folder\/([^/?#]+)/);
  if (match?.[1]) return match[1];
  return decoded.replace(/^(\.\.\/)*Folder\//, "").replace(/^\/+/, "");
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
    .filter(Boolean)
    .map(normalizeMailId);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

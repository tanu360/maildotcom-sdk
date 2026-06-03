import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
  MailComClient,
  normalizeAttachmentId,
  normalizeFolderId,
  normalizeMailId,
  type Folder,
  type MailAttachment,
  type MailAttachmentInput,
  type MailComClientOptions,
  type MailMessage,
} from "../src/index.js";

export function env(name: string): string | undefined;
export function env(name: string, fallback: string): string;
export function env(name: string, fallback?: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

export function csvEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function boolEnv(name: string, fallback = false): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

export function numberEnv(name: string): number | undefined;
export function numberEnv(name: string, fallback: number): number;
export function numberEnv(name: string, fallback?: number): number | undefined {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
  return parsed;
}

export function compactObject<T extends Record<string, unknown>>(input: T): {
  [K in keyof T]: Exclude<T[K], undefined>;
} {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}

export function skip(reason: string, requiredEnv: string[] = []): never {
  printJson("skipped", { skipped: true, reason, requiredEnv });
  process.exit(0);
}

export function createClientFromEnv(): MailComClient {
  const email = env("MAILCOM_EMAIL");
  if (!email) skip("MAILCOM_EMAIL is required to run live examples.", ["MAILCOM_EMAIL"]);

  const options: MailComClientOptions = { email };
  const password = env("MAILCOM_PASSWORD");
  const sessionDir = env("MAILCOM_SESSION_DIR");

  if (password) options.password = password;
  if (sessionDir) options.sessionDir = sessionDir;

  return new MailComClient(options);
}

export async function loginFromEnv(): Promise<MailComClient> {
  const client = createClientFromEnv();
  await client.auth.login();
  return client;
}

export function printJson(label: string, value: unknown): void {
  console.log(`\n${label}`);
  console.log(JSON.stringify(value, jsonReplacer, 2));
}

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof ArrayBuffer) return { byteLength: value.byteLength };
  if (ArrayBuffer.isView(value)) return { byteLength: value.byteLength };
  return value;
}

export async function attachmentInputsFromEnv(): Promise<MailAttachmentInput[]> {
  const paths = csvEnv("MAILCOM_ATTACHMENTS");
  const contentTypes = csvEnv("MAILCOM_ATTACHMENT_CONTENT_TYPES");

  return Promise.all(
    paths.map(async (path, index) => ({
      filename: basename(path),
      contentType: contentTypes[index] ?? "application/octet-stream",
      data: await readFile(path),
    })),
  );
}

export function flattenFolders(folders: Folder[]): Folder[] {
  return folders.flatMap((folder) => [folder, ...flattenFolders(folder.folders ?? [])]);
}

export function folderByType(folders: Folder[], folderType: string): Folder | undefined {
  return flattenFolders(folders).find((folder) => folder.attribute?.folderType === folderType);
}

export function folderId(folder: Folder | undefined): string | undefined {
  return folder?.folderIdentifier ? normalizeFolderId(folder.folderIdentifier) : undefined;
}

export function mailId(message: MailMessage | undefined): string | undefined {
  const value = message?.attribute?.mailIdentifier ?? message?.mailURI;
  return typeof value === "string" ? normalizeMailId(value) : undefined;
}

export function attachmentId(attachment: MailAttachment | undefined): string | undefined {
  const value = attachment?.attachmentURI;
  return typeof value === "string" ? normalizeAttachmentId(value) : undefined;
}

export function compactMessage(message: MailMessage): Record<string, unknown> {
  return {
    id: mailId(message),
    folderId: message.attribute?.folderIdentifier,
    folderType: message.attribute?.folderType,
    read: message.attribute?.read,
    flagged: message.attribute?.flagged,
    hasDownloadableAttachments: message.attribute?.hasDownloadableAttachments,
    from: message.mailHeader?.from,
    to: message.mailHeader?.to,
    subject: message.mailHeader?.subject,
    date: message.mailHeader?.date,
  };
}

export function compactAttachment(attachment: MailAttachment): Record<string, unknown> {
  return {
    id: attachmentId(attachment),
    filename: attachment.filename,
    contentType: attachment.contentType,
    estimatedSize: attachment.estimatedSize,
    inline: attachment.inline,
    thumbnail: attachment.thumbnail,
  };
}

export async function saveBinaryOutput(directory: string, filename: string, data: ArrayBuffer): Promise<string> {
  const outputDirectory = resolve(directory);
  await mkdir(outputDirectory, { recursive: true });
  const path = resolve(outputDirectory, safeOutputFilename(filename));
  const relativePath = relative(outputDirectory, path);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Refusing to write outside ${outputDirectory}.`);
  }
  await writeFile(path, Buffer.from(data));
  return path;
}

function safeOutputFilename(filename: string): string {
  return basename(filename.replace(/\\/g, "/")) || "attachment.bin";
}

import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SessionStore, TokenSession } from "./types.js";

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, TokenSession>();

  async load(email: string): Promise<TokenSession | null> {
    return this.sessions.get(email.toLowerCase()) ?? null;
  }

  async save(email: string, session: TokenSession): Promise<void> {
    this.sessions.set(email.toLowerCase(), session);
  }

  async delete(email: string): Promise<void> {
    this.sessions.delete(email.toLowerCase());
  }
}

export class FileSessionStore implements SessionStore {
  constructor(private readonly directory = join(process.cwd(), ".sessions")) {}

  async load(email: string): Promise<TokenSession | null> {
    const latestPath = await this.latestPathFor(email);
    return latestPath ? this.readSession(latestPath) : null;
  }

  async save(email: string, session: TokenSession): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const sessionPath = this.pathFor(email, session);
    await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
    await this.deleteMatching(email, sessionPath);
  }

  async delete(email: string): Promise<void> {
    await this.deleteMatching(email);
  }

  private pathFor(email: string, session: TokenSession): string {
    const timestamp = session.createdAt || session.updatedAt || Date.now();
    return join(this.directory, `${this.filePrefix(email)}-${timestamp}.json`);
  }

  private async latestPathFor(email: string): Promise<string | null> {
    const prefix = `${this.filePrefix(email)}-`;
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }

    const matches = files
      .map((file) => {
        const timestamp = file.startsWith(prefix) && file.endsWith(".json") ? Number(file.slice(prefix.length, -".json".length)) : Number.NaN;
        return { file, timestamp };
      })
      .filter((match) => Number.isFinite(match.timestamp))
      .sort((left, right) => right.timestamp - left.timestamp);

    return matches[0] ? join(this.directory, matches[0].file) : null;
  }

  private async deleteMatching(email: string, exceptPath?: string): Promise<void> {
    const prefix = `${this.filePrefix(email)}-`;
    let files: string[];
    try {
      files = await readdir(this.directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }

    await Promise.all(
      files
        .filter((file) => file.startsWith(prefix) && file.endsWith(".json"))
        .map((file) => join(this.directory, file))
        .filter((path) => path !== exceptPath)
        .map(unlinkIfExists),
    );
  }

  private filePrefix(email: string): string {
    return email.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  private async readSession(path: string): Promise<TokenSession> {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as TokenSession;
  }
}

async function unlinkIfExists(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

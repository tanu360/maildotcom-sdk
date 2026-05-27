import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileSessionStore, type TokenSession } from "../src/index.js";

test("file session store uses readable email timestamp filenames", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maildotcom-sdk-sessions-"));
  try {
    const store = new FileSessionStore(directory);
    const session: TokenSession = {
      accessToken: "access",
      refreshToken: "refresh",
      createdAt: 1700000000000,
      updatedAt: 1700000000001,
    };

    await store.save("John@Doe.com", session);

    assert.deepEqual(await readdir(directory), ["john_doe_com-1700000000000.json"]);
    assert.deepEqual(await store.load("john@doe.com"), session);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("file session store keeps latest session file per account", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maildotcom-sdk-sessions-"));
  try {
    const store = new FileSessionStore(directory);
    const oldSession: TokenSession = {
      accessToken: "old-access",
      refreshToken: "old-refresh",
      createdAt: 1700000000000,
      updatedAt: 1700000000001,
    };
    const newSession: TokenSession = {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      createdAt: 1700000001000,
      updatedAt: 1700000001001,
    };

    await store.save("john@doe.com", oldSession);
    await store.save("john@doe.com", newSession);

    assert.deepEqual(await readdir(directory), ["john_doe_com-1700000001000.json"]);
    assert.deepEqual(await store.load("john@doe.com"), newSession);

    await store.delete("john@doe.com");
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

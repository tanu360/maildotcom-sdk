import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileSessionStore, type TokenSession } from "../src/index.js";

test("file session store uses compact account timestamp filenames with private permissions", async () => {
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

    const files = await readdir(directory);
    assert.equal(files.length, 1);
    assert.match(files[0] ?? "", /^acct-[a-f0-9]{12}-1700000000000\.json$/);
    assert.equal((await stat(directory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(directory, files[0] ?? ""))).mode & 0o777, 0o600);
    assert.deepEqual(await store.load("john@doe.com"), { ...session, accountEmail: "john@doe.com" });
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

    const files = await readdir(directory);
    assert.equal(files.length, 1);
    assert.match(files[0] ?? "", /^acct-[a-f0-9]{12}-1700000001000\.json$/);
    assert.deepEqual(await store.load("john@doe.com"), { ...newSession, accountEmail: "john@doe.com" });

    await store.delete("john@doe.com");
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("file session store keeps distinct prefixes for colliding readable emails", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maildotcom-sdk-sessions-"));
  try {
    const store = new FileSessionStore(directory);

    await store.save("a+b@mail.com", {
      accessToken: "plus-access",
      refreshToken: "plus-refresh",
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
    });
    await store.save("a_b@mail.com", {
      accessToken: "underscore-access",
      refreshToken: "underscore-refresh",
      createdAt: 1700000001000,
      updatedAt: 1700000001000,
    });

    assert.equal((await readdir(directory)).length, 2);
    assert.equal((await store.load("a+b@mail.com"))?.accessToken, "plus-access");
    assert.equal((await store.load("a_b@mail.com"))?.accessToken, "underscore-access");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

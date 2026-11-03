import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  FileSessionStore,
  MailComAuthError,
  MailComClient,
  MailComValidationError,
  MemorySessionStore,
  normalizeFolderId,
  normalizeMailId,
} from "../src/index.js";

type RecordedRequest = { url: string; method: string; headers: Headers; body: string };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return "";
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof body === "string") return body;
  return String(body);
}

type Handler = (request: RecordedRequest) => Response | Promise<Response>;

function routedFetch(handler: Handler): { fetch: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const request = {
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: await bodyToString(init.body),
    };
    requests.push(request);
    return handler(request);
  };
  return { fetch: fetchImpl, requests };
}

function androidOAuthRoutes(options: { loginFails?: boolean } = {}): Handler {
  let oauthState = "";
  return (request) => {
    const { url } = request;
    if (url.startsWith("https://oauth2.mail.com/authorize")) {
      oauthState = new URL(url).searchParams.get("state") ?? "";
      return new Response(null, {
        status: 303,
        headers: { location: `https://auth.mail.com/loginapp/oauth2?authcode-context=ctx&login_hint=user%40mail.com` },
      });
    }
    if (url.startsWith("https://auth.mail.com/loginapp/oauth2")) return new Response("<html></html>", { status: 200 });
    if (url === "https://login.mail.com/login") {
      return new Response(null, {
        status: 303,
        headers: {
          location: options.loginFails
            ? "https://auth.mail.com/loginapp/oauth2?status=login_failed&login_hint=user%40mail.com&authcode-context=ctx"
            : "https://oauth2.mail.com/authcode?authcode-context=ctx",
        },
      });
    }
    if (url.startsWith("https://oauth2.mail.com/authcode")) {
      return new Response(null, {
        status: 303,
        headers: { location: `com.mail.androidmail.redirect://authorization_code_grant?code=auth-code&state=${oauthState}` },
      });
    }
    if (url === "https://oauth2.mail.com/token") {
      const grantType = new URLSearchParams(request.body).get("grant_type");
      if (grantType === "authorization_code") {
        return jsonResponse({ access_token: "password-access", refresh_token: "password-refresh", expires_in: 3600 });
      }
      const refreshToken = new URLSearchParams(request.body).get("refresh_token");
      if (refreshToken === "password-refresh") return jsonResponse({ access_token: "fresh-access", expires_in: 3600 });
      return jsonResponse({ error: "invalid_grant", error_description: "Refresh token revoked" }, 400);
    }
    throw new Error(`Unhandled request ${request.method} ${url}`);
  };
}

test("wrong password reports a credentials error instead of a redirect error", async () => {
  const { fetch } = routedFetch(androidOAuthRoutes({ loginFails: true }));
  const client = new MailComClient({ email: "user@mail.com", password: "wrong", sessionStore: new MemorySessionStore(), fetch });

  await assert.rejects(client.auth.login(), (error: unknown) => {
    assert.ok(error instanceof MailComAuthError);
    assert.match(error.message, /login failed.*email and password/i);
    return true;
  });
});

test("a revoked refresh token on 401 falls back to password login and retries", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", { accessToken: "stale-access", refreshToken: "revoked", createdAt: 1, updatedAt: 1 });

  const oauth = androidOAuthRoutes();
  const { fetch, requests } = routedFetch((request) => {
    if (request.url.includes("/emailaddresses")) {
      return request.headers.get("authorization") === "Bearer fresh-access"
        ? jsonResponse({ mailaddresslist: [{ address: "user@mail.com" }] })
        : jsonResponse({ error: "expired" }, 401);
    }
    if (request.method === "HEAD") return new Response(null, { status: 200 });
    return oauth(request);
  });

  const client = new MailComClient({ email: "user@mail.com", password: "secret", sessionStore: store, fetch });
  await client.auth.login();
  const aliases = await client.account.aliases();

  assert.equal(aliases.mailaddresslist?.[0]?.address, "user@mail.com");
  assert.ok(requests.some((request) => request.url === "https://login.mail.com/login"));
  assert.equal((await store.load("user@mail.com"))?.refreshToken, "password-refresh");
});

test("a network failure during cached refresh keeps the stored session", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", { accessToken: "cached", refreshToken: "refresh", createdAt: 1, updatedAt: 1 });

  const { fetch } = routedFetch(() => {
    throw new TypeError("fetch failed");
  });
  const client = new MailComClient({ email: "user@mail.com", sessionStore: store, fetch });

  await assert.rejects(client.auth.login(), /fetch failed/);
  assert.equal((await store.load("user@mail.com"))?.refreshToken, "refresh");
});

test("a rejected cached refresh token is cleared before password login", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", { accessToken: "cached", refreshToken: "revoked", createdAt: 1, updatedAt: 1 });

  const oauth = androidOAuthRoutes();
  const { fetch } = routedFetch((request) => (request.method === "HEAD" ? new Response(null, { status: 401 }) : oauth(request)));
  const client = new MailComClient({ email: "user@mail.com", password: "secret", sessionStore: store, fetch });

  const session = await client.auth.login();
  assert.equal(session.accessToken, "fresh-access");
  assert.equal((await store.load("user@mail.com"))?.refreshToken, "password-refresh");
});

test("file session store treats a corrupt session file as missing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maildotcom-sdk-corrupt-"));
  try {
    const store = new FileSessionStore(directory);
    await store.save("user@mail.com", { accessToken: "a", refreshToken: "r", createdAt: 1700000000000, updatedAt: 1 });
    const [file] = await readdir(directory);
    await writeFile(join(directory, file ?? ""), "{\"accessToken\":", "utf8");

    assert.equal(await store.load("user@mail.com"), null);
    assert.deepEqual(await readdir(directory), []);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("file session store leaves no temp files after saving", async () => {
  const directory = await mkdtemp(join(tmpdir(), "maildotcom-sdk-atomic-"));
  try {
    const store = new FileSessionStore(directory);
    await store.save("user@mail.com", { accessToken: "a", refreshToken: "r", createdAt: 1700000000000, updatedAt: 1 });
    await store.save("user@mail.com", { accessToken: "b", refreshToken: "r", createdAt: 1700000000000, updatedAt: 2 });

    const files = await readdir(directory);
    assert.equal(files.length, 1);
    assert.ok(files.every((file) => file.endsWith(".json")));
    assert.equal((await store.load("user@mail.com"))?.accessToken, "b");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("mail actions reject missing ids before sending a request", async () => {
  const { fetch, requests } = routedFetch(() => new Response(null, { status: 200 }));
  const store = new MemorySessionStore();
  await store.save("user@mail.com", { accessToken: "a", refreshToken: "r", createdAt: 1, updatedAt: 1 });
  const client = new MailComClient({ email: "user@mail.com", sessionStore: store, fetch });
  await client.auth.login();
  const sentBefore = requests.length;

  await assert.rejects(client.actions.markRead(undefined as unknown as string), MailComValidationError);
  await assert.rejects(client.mail.getBody(""), MailComValidationError);
  await assert.rejects(client.actions.moveToTrash(["123", "  "]), MailComValidationError);
  assert.equal(requests.length, sentBefore);
});

test("id normalizers reject empty and unparseable ids", () => {
  assert.equal(normalizeMailId("../../Mail/123"), "123");
  assert.equal(normalizeFolderId("/Folder/456"), "456");
  assert.throws(() => normalizeMailId(""), MailComValidationError);
  assert.throws(() => normalizeMailId("../../Mail/"), MailComValidationError);
  assert.throws(() => normalizeFolderId(undefined as unknown as string), MailComValidationError);
});

test("a blocked login request reports the block instead of a missing redirect", async () => {
  const oauth = androidOAuthRoutes();
  const { fetch } = routedFetch((request) =>
    request.url === "https://login.mail.com/login"
      ? jsonResponse({ error: { "status-code": "403", message: "blocked" } }, 403)
      : oauth(request),
  );
  const client = new MailComClient({ email: "user@mail.com", password: "secret", sessionStore: new MemorySessionStore(), fetch });

  await assert.rejects(client.auth.login(), /blocked the login \(HTTP 403 at login redirect\)/);
});

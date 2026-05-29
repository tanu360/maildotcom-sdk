import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EXCLUDED_FOLDERS,
  MailComClient,
  MemorySessionStore,
  NO_SPAM_EXCLUDED_FOLDERS,
  type TokenSession,
} from "../src/index.js";

type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(init.headers)) },
  });
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return "";
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof body === "string") return body;
  if (body instanceof Blob) return body.text();
  return String(body);
}

function mockFetch(responses: Response[]): { fetch: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: await bodyToString(init.body),
    });
    const response = responses.shift();
    if (!response) throw new Error("No mock response queued");
    return response;
  };
  return { fetch: fetchImpl, requests };
}

test("send builds minimal mail payload and parses SSE response", async () => {
  const store = new MemorySessionStore();
  const session: TokenSession = {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.save("user@mail.com", session);

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Cmsg%40host%3E\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const result = await client.mail.send({
    from: "User <user@mail.com>",
    to: "recipient@example.com",
    subject: "Hello",
    htmlBody: "<html><body>Hi</body></html>",
  });

  assert.equal(result.messageId, "<msg@host>");
  const sendRequest = requests.at(-1);
  assert.match(sendRequest?.url ?? "", /\/Mailsubmission\?/);
  assert.match(sendRequest?.url ?? "", /%40SUBMISSION-TRANSIENT-UUID=/);
  assert.match(sendRequest?.url ?? "", /MailSizeLimitExceededExceptionMapper\.explicitCode=true/);
  assert.equal(sendRequest?.headers.get("authorization"), "Bearer access");
  const payload = JSON.parse(sendRequest?.body ?? "{}") as { mailHeader: { to: string[] }; htmlBody: string };
  assert.deepEqual(payload.mailHeader.to, ["recipient@example.com"]);
  assert.equal(payload.htmlBody, "<html><body>Hi</body></html>");
});

test("send rejects attachments over the 25 MB limit before request", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([new Response(null, { status: 200 })]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await assert.rejects(
    client.mail.send({
      from: "User <user@mail.com>",
      to: "recipient@example.com",
      subject: "Too large",
      htmlBody: "body",
      attachments: [
        {
          contentType: "application/octet-stream",
          filename: "too-large.bin",
          data: new Uint8Array(25 * 1024 * 1024 + 1),
        },
      ],
    }),
    /25 MB limit/,
  );

  assert.equal(requests.length, 1);
});

test("send rejects attachment input without data or base64data before request", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([new Response(null, { status: 200 })]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await assert.rejects(
    client.mail.send({
      to: "recipient@example.com",
      subject: "Missing attachment data",
      htmlBody: "body",
      attachments: [
        {
          contentType: "application/pdf",
          filename: "invoice.pdf",
        },
      ],
    }),
    /invoice\.pdf.*data or base64data/,
  );

  assert.equal(requests.length, 1);
});

test("send allows explicitly empty base64 attachment data", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Cmsg%40host%3E\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.mail.send({
    from: "User <user@mail.com>",
    to: "recipient@example.com",
    subject: "Empty attachment",
    htmlBody: "body",
    attachments: [
      {
        contentType: "text/plain",
        filename: "empty.txt",
        base64data: "",
      },
    ],
  });

  const payload = JSON.parse(requests.at(-1)?.body ?? "{}") as { attachments: Array<{ base64data: string }> };
  assert.equal(payload.attachments[0]?.base64data, "");
});

test("send rejects attachment input with both data and base64data before request", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([new Response(null, { status: 200 })]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await assert.rejects(
    client.mail.send({
      to: "recipient@example.com",
      subject: "Ambiguous attachment data",
      htmlBody: "body",
      attachments: [
        {
          contentType: "text/plain",
          filename: "ambiguous.txt",
          base64data: "",
          data: "real data",
        },
      ],
    }),
    /ambiguous\.txt.*both data and base64data/,
  );

  assert.equal(requests.length, 1);
});

test("reply and forward infer prefixed subjects from original mail when available", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Creply%40host%3E\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    new Response("id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Cforward%40host%3E\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  const originalMail = {
    mailURI: "../../Mail/123",
    attribute: { mailIdentifier: "123" },
    mailHeader: { from: "sender@example.com", subject: "Project ABC" },
  };

  await client.login();
  await client.mail.reply({
    originalMailId: "123",
    from: "User <user@mail.com>",
    htmlBody: "reply",
    originalMail,
  });
  await client.mail.forward({
    originalMailId: "123",
    from: "User <user@mail.com>",
    to: "recipient@example.com",
    htmlBody: "forward",
    originalMail,
  });

  assert.equal(JSON.parse(requests[1]?.body ?? "{}").mailHeader.subject, "Re: Project ABC");
  assert.match(requests[1]?.url ?? "", /%40SUBMISSION-TRANSIENT-IN-REPLY-TO=123/);
  assert.equal(JSON.parse(requests[2]?.body ?? "{}").mailHeader.subject, "Fwd: Project ABC");
  assert.match(requests[2]?.url ?? "", /%40SUBMISSION-TRANSIENT-FORWARDED-ORIGINAL=123/);
});

test("reply and forward keep valid empty-subject fallback", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Creply%40host%3E\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
    new Response("id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Cforward%40host%3E\n\n", {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.mail.reply({
    originalMailId: "123",
    from: "User <user@mail.com>",
    to: "sender@example.com",
    htmlBody: "reply",
  });
  await client.mail.forward({
    originalMailId: "123",
    from: "User <user@mail.com>",
    to: "recipient@example.com",
    htmlBody: "forward",
  });

  assert.equal(JSON.parse(requests[1]?.body ?? "{}").mailHeader.subject, "Re:");
  assert.equal(JSON.parse(requests[2]?.body ?? "{}").mailHeader.subject, "Fwd:");
});

test("getBody marks the message read by default", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("<html>body</html>", { status: 200, headers: { "content-type": "text/html" } }),
    jsonResponse({ "123": { status: 204, detail: "SUCCESS" } }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const body = await client.mail.getBody("123");

  assert.equal(body, "<html>body</html>");
  assert.match(requests[1]?.url ?? "", /\/Mail\/123\/Body\?absoluteURI=false$/);
  assert.deepEqual(JSON.parse(requests[2]?.body ?? "{}"), {
    read: true,
    mailURIs: ["../../Mail/123"],
  });
});

test("getBody returns the fetched body when best-effort mark read fails", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("<html>body</html>", { status: 200, headers: { "content-type": "text/html" } }),
    jsonResponse({ error: "temporary failure" }, { status: 503 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const body = await client.mail.getBody("123");

  assert.equal(body, "<html>body</html>");
  assert.deepEqual(JSON.parse(requests[2]?.body ?? "{}"), {
    read: true,
    mailURIs: ["../../Mail/123"],
  });
});

test("getBody can skip marking read when requested", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("body", { status: 200, headers: { "content-type": "text/plain" } }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const body = await client.mail.getBody("123", { format: "text", markRead: false });

  assert.equal(body, "body");
  assert.equal(requests.length, 2);
  assert.match(requests[1]?.url ?? "", /\/Mail\/123\/Body\?absoluteURI=false$/);
});

test("search includes spam by default and lets callers exclude it", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ mail: [] }),
    jsonResponse({ mail: [] }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.mail.search("needle");
  await client.mail.search("needle", {
    excludeFolderTypeOrId: ["SPAM", "TRASH", "DRAFTS", "OUTBOX"],
  });

  const defaultPayload = JSON.parse(requests[1]?.body ?? "{}") as { excludeFolderTypeOrId: string[] };
  assert.deepEqual(defaultPayload.excludeFolderTypeOrId, DEFAULT_EXCLUDED_FOLDERS);

  const explicitPayload = JSON.parse(requests[2]?.body ?? "{}") as { excludeFolderTypeOrId: string[] };
  assert.deepEqual(explicitPayload.excludeFolderTypeOrId, NO_SPAM_EXCLUDED_FOLDERS);
});

test("search escapes condition parser separators in user query", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ mail: [] }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.mail.search("a:b\\c\nnext");

  const payload = JSON.parse(requests[1]?.body ?? "{}") as { include: Array<{ conditions: string[] }> };
  assert.equal(payload.include[0]?.conditions[0], "mail.header:from,replyTo,cc,bcc,to,subject:a\\:b\\\\c next");
});

test("mail convenience aliases reuse confirmed list and search behavior", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({
      folders: [
        { folderIdentifier: "inbox-id", attribute: { folderType: "INBOX", folderName: "Inbox" } },
      ],
    }),
    jsonResponse({ mail: [], totalCount: 0, unreadCount: 0 }),
    jsonResponse({
      mail: [
        { mailURI: "../../Mail/subject-match", mailHeader: { subject: "Invoice ready", from: "billing@example.com" } },
        { mailURI: "../../Mail/subject-miss", mailHeader: { subject: "Other", from: "invoice@example.com" } },
      ],
    }),
    jsonResponse({
      mail: [
        { mailURI: "../../Mail/sender-match", mailHeader: { subject: "Hello", from: "Billing Team <billing@example.com>" } },
        { mailURI: "../../Mail/sender-miss", mailHeader: { subject: "billing@example.com", from: "other@example.com" } },
      ],
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const listed = await client.mail.listAll({ amount: 5 });
  const subjectMatches = await client.mail.findBySubject("Invoice");
  const senderMatches = await client.mail.findBySender("billing@example.com");

  assert.equal(listed.totalCount, 0);
  assert.deepEqual(subjectMatches.map((message) => message.mailURI), ["../../Mail/subject-match"]);
  assert.deepEqual(senderMatches.map((message) => message.mailURI), ["../../Mail/sender-match"]);

  assert.match(requests[2]?.url ?? "", /\/Folder\/inbox-id\/Mail\?absoluteURI=false&orderBy=INTERNALDATE\+desc&amount=5&tagsShowAll=true$/);
  assert.match(requests[3]?.body ?? "", /mail\.header:from,replyTo,cc,bcc,to,subject:Invoice/);
  assert.match(requests[4]?.body ?? "", /mail\.header:from,replyTo,cc,bcc,to,subject:billing@example\.com/);
});

test("listByFolder and syncFolder accept folder URI ids", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ mail: [], totalCount: 0 }),
    new Response("../../Mail/123\r\n", { status: 200, headers: { "content-type": "text/uri-list" } }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.mail.listByFolder("/Folder/inbox-id", { amount: 1 });
  const sync = await client.mail.syncFolder("/Folder/inbox-id", { after: 1779860000000 });

  assert.deepEqual(sync.mailIds, ["123"]);
  assert.match(requests[1]?.url ?? "", /\/Folder\/inbox-id\/Mail\?/);
  assert.doesNotMatch(requests[1]?.url ?? "", /%2FFolder%2F/);
  assert.match(requests[2]?.url ?? "", /\/Folder\/inbox-id\/Mail\?/);
  assert.doesNotMatch(requests[2]?.url ?? "", /%2FFolder%2F/);
});

test("authorized requests refresh once on 401 and retry", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "old-access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ error: "expired" }, { status: 401 }),
    jsonResponse({ access_token: "new-access", expires_in: 3600 }),
    jsonResponse({ mailaddresslist: [] }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.account.aliases();

  assert.equal(requests[1]?.headers.get("authorization"), "Bearer old-access");
  assert.match(requests[2]?.body ?? "", /grant_type=refresh_token/);
  assert.equal(requests[3]?.headers.get("authorization"), "Bearer new-access");
});

test("login falls back to refresh when cached token validation has a network failure", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "cached-access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = await bodyToString(init.body);
    requests.push({
      url,
      method,
      headers: new Headers(init.headers),
      body,
    });

    if (url === "https://mobsi.mail.com/rest/MobSI/UserData" && method === "HEAD") {
      throw new Error("temporary network failure");
    }

    if (url === "https://oauth2.mail.com/token") {
      return jsonResponse({ access_token: "new-access", expires_in: 3600 });
    }

    throw new Error(`Unhandled request ${method} ${url}`);
  };

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch: fetchImpl,
  });

  const session = await client.login();

  assert.equal(session.accessToken, "new-access");
  assert.equal(requests[0]?.method, "HEAD");
  assert.match(requests[1]?.body ?? "", /grant_type=refresh_token/);
  assert.equal((await store.load("user@mail.com"))?.accessToken, "new-access");
});

test("API errors include a response body snippet in the message", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ title: "Ambiguous URI path separator" }, { status: 400 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await assert.rejects(
    client.mail.listByFolder("bad-folder"),
    /GET .*\/Folder\/bad-folder\/Mail.* failed with 400: .*Ambiguous URI path separator/,
  );
});

test("parallel first authenticated calls share one Android OAuth login", async () => {
  const store = new MemorySessionStore();
  const requests: RecordedRequest[] = [];
  let oauthState = "";

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = await bodyToString(init.body);
    requests.push({
      url,
      method,
      headers: new Headers(init.headers),
      body,
    });

    if (url === "https://oauth2.mail.com/token") {
      const form = new URLSearchParams(body);
      const grantType = form.get("grant_type");
      if (grantType === "authorization_code") {
        return jsonResponse({ access_token: "android-access", refresh_token: "android-refresh", expires_in: 3600 });
      }
      if (grantType === "refresh_token") {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse({ access_token: "scoped-android-access", expires_in: 3600 });
      }
    }

    if (url.startsWith("https://oauth2.mail.com/authorize")) {
      oauthState = new URL(url).searchParams.get("state") ?? "";
      return new Response(null, {
        status: 303,
        headers: { location: `https://auth.mail.com/loginapp/oauth2?state=${oauthState}&authcode-context=ctx&login_hint=user%40mail.com` },
      });
    }

    if (url.startsWith("https://auth.mail.com/loginapp/oauth2")) {
      return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    }

    if (url === "https://login.mail.com/login") {
      return new Response(null, {
        status: 303,
        headers: { location: "https://oauth2.mail.com/authcode?authcode-context=ctx&auth_time=now&ott=ott" },
      });
    }

    if (url.startsWith("https://oauth2.mail.com/authcode")) {
      return new Response(null, {
        status: 303,
        headers: { location: `com.mail.androidmail.redirect://authorization_code_grant?code=auth-code&state=${oauthState}` },
      });
    }

    if (url.endsWith("/folders?absoluteURI=false")) {
      return jsonResponse({ folders: [] });
    }

    if (url.endsWith("/emailaddresses?absoluteURI=false&q.type.in=SENDER,MAIL_COLLECT&q.state.in=ACTIVE")) {
      return jsonResponse({ mailaddresslist: [] });
    }

    if (url === "https://mobsi.mail.com/rest/MobSI/UserData") {
      return jsonResponse({ user: "ok" });
    }

    throw new Error(`Unhandled request ${method} ${url}`);
  };

  const client = new MailComClient({
    email: "user@mail.com",
    password: "secret",
    sessionStore: store,
    fetch: fetchImpl,
  });

  await Promise.all([client.folders.list(), client.account.aliases(), client.account.userData()]);

  assert.equal(requests.filter((request) => request.url.startsWith("https://oauth2.mail.com/authorize")).length, 1);
  assert.equal(requests.filter((request) => request.url === "https://login.mail.com/login").length, 1);
  assert.deepEqual(
    requests
      .filter((request) => request.url === "https://oauth2.mail.com/token")
      .map((request) => new URLSearchParams(request.body).get("grant_type")),
    ["authorization_code", "refresh_token"],
  );
  assert.equal(requests.filter((request) => request.headers.get("authorization") === "Bearer scoped-android-access").length, 3);
});

test("parallel public refresh calls share one token refresh request", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = await bodyToString(init.body);
    requests.push({
      url,
      method,
      headers: new Headers(init.headers),
      body,
    });

    if (url === "https://mobsi.mail.com/rest/MobSI/UserData" && method === "HEAD") {
      return new Response(null, { status: 200 });
    }

    if (url === "https://oauth2.mail.com/token") {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return jsonResponse({ access_token: "new-access", expires_in: 3600 });
    }

    throw new Error(`Unhandled request ${method} ${url}`);
  };

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch: fetchImpl,
  });

  await client.login();
  const [first, second, third] = await Promise.all([
    client.auth.refresh(),
    client.auth.refresh(),
    client.auth.refresh(),
  ]);

  assert.equal(first.accessToken, "new-access");
  assert.equal(second.accessToken, "new-access");
  assert.equal(third.accessToken, "new-access");
  assert.equal(requests.filter((request) => request.url === "https://oauth2.mail.com/token").length, 1);
});

test("default login uses Android OAuth directly", async () => {
  const store = new MemorySessionStore();
  const requests: RecordedRequest[] = [];
  let oauthState = "";

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const body = await bodyToString(init.body);
    requests.push({
      url,
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body,
    });

    if (url === "https://oauth2.mail.com/token") {
      const form = new URLSearchParams(body);
      const grantType = form.get("grant_type");
      if (grantType === "authorization_code") {
        assert.equal(form.get("code"), "auth-code");
        assert.equal(form.get("client_id"), "mailcom_mailapp_android");
        assert.ok(form.get("code_verifier"));
        return jsonResponse({ access_token: "android-access", refresh_token: "android-refresh", expires_in: 3600 });
      }
      if (grantType === "refresh_token") {
        assert.equal(form.get("refresh_token"), "android-refresh");
        return jsonResponse({ access_token: "scoped-android-access", expires_in: 3600 });
      }
    }

    if (url.startsWith("https://oauth2.mail.com/authorize")) {
      oauthState = new URL(url).searchParams.get("state") ?? "";
      return new Response(null, {
        status: 303,
        headers: { location: `https://auth.mail.com/loginapp/oauth2?state=${oauthState}&authcode-context=ctx&login_hint=user%40mail.com` },
      });
    }

    if (url.startsWith("https://auth.mail.com/loginapp/oauth2")) {
      return new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    }

    if (url === "https://login.mail.com/login") {
      return new Response(null, {
        status: 303,
        headers: { location: "https://oauth2.mail.com/authcode?authcode-context=ctx&auth_time=now&ott=ott" },
      });
    }

    if (url.startsWith("https://oauth2.mail.com/authcode")) {
      return new Response(null, {
        status: 303,
        headers: { location: `com.mail.androidmail.redirect://authorization_code_grant?code=auth-code&state=${oauthState}` },
      });
    }

    throw new Error(`Unhandled request ${init.method ?? "GET"} ${url}`);
  };

  const client = new MailComClient({
    email: "user@mail.com",
    password: "secret",
    sessionStore: store,
    fetch: fetchImpl,
  });

  const session = await client.login();
  assert.equal(session.accessToken, "scoped-android-access");
  assert.equal(session.refreshToken, "android-refresh");
  assert.deepEqual(
    requests
      .filter((request) => request.url === "https://oauth2.mail.com/token")
      .map((request) => new URLSearchParams(request.body).get("grant_type")),
    ["authorization_code", "refresh_token"],
  );
  assert.ok(requests.some((request) => request.url.startsWith("https://oauth2.mail.com/authorize")));
  assert.ok(requests.some((request) => request.url === "https://login.mail.com/login"));
});

test("draft create resolves empty 201 response from Location header", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("", { status: 201, headers: { location: "../../Mail/draft-b" } }),
    jsonResponse({
      mail: [
        {
          mailURI: "../../Mail/draft-a",
          attribute: { mailIdentifier: "draft-a", folderType: "DRAFTS" },
          mailHeader: { subject: "Draft subject", to: ["recipient@example.com"] },
        },
        {
          mailURI: "../../Mail/draft-b",
          attribute: { mailIdentifier: "draft-b", folderType: "DRAFTS" },
          mailHeader: { subject: "Draft subject", to: ["recipient@example.com"] },
        },
      ],
      totalCount: 2,
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const draft = await client.drafts.create({
    from: "User <user@mail.com>",
    to: "recipient@example.com",
    subject: "Draft subject",
    htmlBody: "draft",
  });

  assert.equal(draft.attribute?.mailIdentifier, "draft-b");
  assert.ok(requests.some((request) => request.url.includes("/Folder/DRAFTS/Mail")));
});

test("draft create does not guess when empty response has no Location header", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("", { status: 201 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await assert.rejects(
    client.drafts.create({
      from: "User <user@mail.com>",
      to: "recipient@example.com",
      subject: "Draft subject",
      htmlBody: "draft",
    }),
    /no Location header/,
  );

  assert.equal(requests.length, 2);
});

test("draft update empty response resolves the new draft from Location header", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("", { status: 201, headers: { location: "draft-new" } }),
    jsonResponse({
      mail: [
        {
          mailURI: "../../Mail/draft-a",
          attribute: { mailIdentifier: "draft-a", folderType: "DRAFTS" },
          mailHeader: { subject: "Same subject", to: ["recipient@example.com"] },
        },
        {
          mailURI: "../../Mail/draft-b",
          attribute: { mailIdentifier: "draft-b", folderType: "DRAFTS" },
          mailHeader: { subject: "Same subject", to: ["recipient@example.com"] },
        },
        {
          mailURI: "../../Mail/draft-new",
          attribute: { mailIdentifier: "draft-new", folderType: "DRAFTS" },
          mailHeader: { subject: "Same subject", to: ["recipient@example.com"] },
        },
      ],
      totalCount: 3,
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const draft = await client.drafts.update("draft-b", {
    from: "User <user@mail.com>",
    to: "recipient@example.com",
    subject: "Same subject",
    htmlBody: "updated draft B",
  });

  assert.equal(draft.attribute?.mailIdentifier, "draft-new");
});

test("logout revokes with refresh_token header and clears session store", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response(null, { status: 204 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.auth.logout();

  const logoutRequest = requests.at(-1);
  assert.equal(logoutRequest?.method, "DELETE");
  assert.equal(logoutRequest?.headers.get("refresh_token"), "refresh");
  assert.equal(logoutRequest?.headers.get("authorization"), null);
  assert.equal(await store.load("user@mail.com"), null);
});

test("logout clears local session store when remote revoke fails", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ error: "temporary failure" }, { status: 503 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await assert.rejects(client.auth.logout(), /DELETE https:\/\/oauth2\.mail\.com\/token failed with 503/);

  assert.equal(requests.at(-1)?.method, "DELETE");
  assert.equal(await store.load("user@mail.com"), null);
});

test("folders and aliases use mobile query parameters confirmed by HAR", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ folders: [{ folderIdentifier: "inbox-id", attribute: { folderType: "INBOX" } }] }),
    jsonResponse({ mailaddresslist: [{ address: "user@mail.com", displayName: "User", defaultSenderAddress: true }] }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const folders = await client.folders.list();
  const aliases = await client.account.aliases();

  assert.equal(folders[0]?.folderIdentifier, "inbox-id");
  assert.equal(aliases.mailaddresslist?.[0]?.displayName, "User");
  assert.match(requests[1]?.url ?? "", /\/folders\?absoluteURI=false$/);
  assert.match(requests[2]?.url ?? "", /emailaddresses\?absoluteURI=false&q\.type\.in=SENDER,MAIL_COLLECT&q\.state\.in=ACTIVE$/);
});

test("listIncoming scans every non-excluded folder by default with folder metadata", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({
      folders: [
        { folderIdentifier: "inbox-id", attribute: { folderType: "INBOX", folderName: "Inbox" } },
        { folderIdentifier: "spam-id", attribute: { folderType: "SPAM", folderName: "Spam" } },
        { folderIdentifier: "custom-id", attribute: { folderType: "USER_DEFINED", folderName: "Receipts" } },
        { folderIdentifier: "sent-id", attribute: { folderType: "SENT", folderName: "Sent" } },
        { folderIdentifier: "trash-id", attribute: { folderType: "TRASH", folderName: "Trash" } },
        { folderIdentifier: "drafts-id", attribute: { folderType: "DRAFTS", folderName: "Drafts" } },
        { folderIdentifier: "outbox-id", attribute: { folderType: "OUTBOX", folderName: "Outbox" } },
      ],
    }),
    jsonResponse({
      mail: [
        {
          mailURI: "../../Mail/inbox-mail",
          attribute: { mailIdentifier: "inbox-mail", read: false },
          mailHeader: { subject: "Inbox Code", date: 1000 },
        },
      ],
      totalCount: 1,
      unreadCount: 1,
    }),
    jsonResponse({
      mail: [
        {
          mailURI: "../../Mail/spam-mail",
          attribute: { mailIdentifier: "spam-mail", read: true },
          mailHeader: { subject: "Spam Code", date: 2000 },
        },
      ],
      totalCount: 1,
      unreadCount: 0,
    }),
    jsonResponse({
      mail: [
        {
          mailURI: "../../Mail/custom-mail",
          attribute: { mailIdentifier: "custom-mail", read: false },
          mailHeader: { subject: "Filtered receipt", date: 3000 },
        },
      ],
      totalCount: 1,
      unreadCount: 1,
    }),
    jsonResponse({
      mail: [
        {
          mailURI: "../../Mail/sent-mail",
          attribute: { mailIdentifier: "sent-mail", read: true },
          mailHeader: { subject: "Sent mail", date: 500 },
        },
      ],
      totalCount: 1,
      unreadCount: 0,
    }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const incoming = await client.mail.listIncoming({ amount: 10 });

  assert.deepEqual(
    incoming.mail.map((mail) => [mail.attribute?.mailIdentifier, mail.sourceFolder.folderType]),
    [
      ["custom-mail", "USER_DEFINED"],
      ["spam-mail", "SPAM"],
      ["inbox-mail", "INBOX"],
      ["sent-mail", "SENT"],
    ],
  );
  assert.equal(incoming.unreadCount, 2);
  assert.deepEqual(
    incoming.folders.map((folder) => folder.folderType),
    ["INBOX", "SPAM", "USER_DEFINED", "SENT"],
  );
  assert.match(requests[2]?.url ?? "", /\/Folder\/inbox-id\/Mail\?absoluteURI=false&orderBy=INTERNALDATE\+desc&amount=10&tagsShowAll=true$/);
  assert.match(requests[3]?.url ?? "", /\/Folder\/spam-id\/Mail\?absoluteURI=false&orderBy=INTERNALDATE\+desc&amount=10&tagsShowAll=true$/);
  assert.match(requests[4]?.url ?? "", /\/Folder\/custom-id\/Mail\?absoluteURI=false&orderBy=INTERNALDATE\+desc&amount=10&tagsShowAll=true$/);
  assert.match(requests[5]?.url ?? "", /\/Folder\/sent-id\/Mail\?absoluteURI=false&orderBy=INTERNALDATE\+desc&amount=10&tagsShowAll=true$/);
});

test("listIncoming limits concurrent folder reads", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  let inFlightFolderReads = 0;
  let maxInFlightFolderReads = 0;
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";

    if (url === "https://mobsi.mail.com/rest/MobSI/UserData" && method === "HEAD") {
      return new Response(null, { status: 200 });
    }

    if (url.endsWith("/folders?absoluteURI=false")) {
      return jsonResponse({
        folders: Array.from({ length: 8 }, (_, index) => ({
          folderIdentifier: `folder-${index}`,
          attribute: { folderType: "USER_DEFINED", folderName: `Folder ${index}` },
        })),
      });
    }

    const folderId = url.match(/\/Folder\/(folder-\d+)\/Mail/)?.[1];
    if (folderId) {
      inFlightFolderReads += 1;
      maxInFlightFolderReads = Math.max(maxInFlightFolderReads, inFlightFolderReads);
      await new Promise((resolve) => setTimeout(resolve, 10));
      inFlightFolderReads -= 1;
      return jsonResponse({
        mail: [
          {
            mailURI: `../../Mail/${folderId}-mail`,
            attribute: { mailIdentifier: `${folderId}-mail`, read: true },
            mailHeader: { subject: folderId, date: 1000 },
          },
        ],
      });
    }

    throw new Error(`Unhandled request ${method} ${url}`);
  };

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch: fetchImpl,
  });

  await client.login();
  const incoming = await client.mail.listIncoming({ amount: 1 });

  assert.equal(incoming.totalCount, 8);
  assert.equal(maxInFlightFolderReads, 5);
});

test("folder create rename expire move and delete use HAR-confirmed endpoints", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ folderIdentifier: "folder-id", attribute: { folderName: "SDK Test", folderType: "USER_DEFINED" } }, { status: 201 }),
    jsonResponse({ folderIdentifier: "folder-id", attribute: { folderName: "Renamed", folderType: "USER_DEFINED" } }),
    jsonResponse({ folderIdentifier: "folder-id", attribute: { folderName: "Renamed", folderType: "USER_DEFINED" } }),
    jsonResponse({ folderIdentifier: "folder-id", attribute: { folderName: "SDK Test", folderType: "USER_DEFINED" } }),
    new Response(null, { status: 204 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const folder = await client.folders.create("SDK Test");
  await client.folders.rename(folder.folderIdentifier ?? "folder-id", "Renamed");
  await client.folders.setExpireDays(folder.folderIdentifier ?? "folder-id", 92);
  await client.folders.move(folder.folderIdentifier ?? "folder-id", "parent-id");
  await client.folders.delete("/Folder/folder-id");

  assert.match(requests[1]?.url ?? "", /\/Mailbox\/primaryMailbox\/Folder\?absoluteURI=false$/);
  assert.equal(requests[1]?.method, "POST");
  assert.equal(requests[1]?.headers.get("accept"), "application/vnd.ui.trinity.folder-v2+json");
  assert.equal(requests[1]?.headers.get("content-type"), "application/vnd.ui.trinity.folder.create+json; charset=utf-8");
  assert.deepEqual(JSON.parse(requests[1]?.body ?? "{}"), {
    folderName: "SDK Test",
    folderType: "USER_DEFINED",
  });

  assert.match(requests[2]?.url ?? "", /\/Mailbox\/primaryMailbox\/Folder\/folder-id\?absoluteURI=false$/);
  assert.equal(requests[2]?.method, "POST");
  assert.equal(requests[2]?.headers.get("content-type"), "application/vnd.ui.trinity.folder.update+json");
  assert.deepEqual(JSON.parse(requests[2]?.body ?? "{}"), {
    folderName: "Renamed",
  });

  assert.match(requests[3]?.url ?? "", /\/Mailbox\/primaryMailbox\/Folder\/folder-id\?absoluteURI=false$/);
  assert.equal(requests[3]?.method, "POST");
  assert.equal(requests[3]?.headers.get("content-type"), "application/vnd.ui.trinity.folder.update+json");
  assert.deepEqual(JSON.parse(requests[3]?.body ?? "{}"), {
    expire: 92,
  });

  assert.match(requests[4]?.url ?? "", /\/Mailbox\/primaryMailbox\/Folder\/folder-id\?absoluteURI=false$/);
  assert.equal(requests[4]?.method, "POST");
  assert.equal(requests[4]?.headers.get("content-type"), "application/vnd.ui.trinity.folder.update+json");
  assert.deepEqual(JSON.parse(requests[4]?.body ?? "{}"), {
    parentFolderURI: "/Folder/parent-id",
  });

  assert.match(requests[5]?.url ?? "", /\/Mailbox\/primaryMailbox\/Folder\/folder-id\?absoluteURI=false$/);
  assert.equal(requests[5]?.method, "DELETE");
});

test("syncFolder wraps text uri-list delta polling", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    new Response("../../Mail/123\r\n../../Mail/456\r\n", { status: 200, headers: { "content-type": "text/uri-list" } }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  const result = await client.mail.syncFolder("inbox-id", { after: 1779860000000 });

  assert.deepEqual(result.mailIds, ["123", "456"]);
  assert.match(
    requests[1]?.url ?? "",
    /\/Folder\/inbox-id\/Mail\?absoluteURI=false&orderBy=INTERNALDATE\+desc&condition=mail\.internaldate\.after%3A1779860000000$/,
  );
  assert.equal(requests[1]?.headers.get("accept"), "text/uri-list");
});

test("updateAliasDisplayName sends minimal mail address payload", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({
      mailaddresslist: [
        {
          type: "MANAGED",
          entryDate: "2026-05-24T01:17:11Z",
          address: "user@mail.com",
          displayName: "Old Name",
          defaultSenderAddress: true,
          defaultReceiverAddress: true,
          pgpEnabled: false,
          deletable: false,
        },
      ],
    }),
    new Response(null, { status: 204 }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.account.updateAliasDisplayName("USER@mail.com", "New Name");

  const updateRequest = requests.at(-1);
  assert.equal(updateRequest?.method, "PUT");
  assert.ok(updateRequest?.url.endsWith("/MailAccount/accountId/EmailAddress/user@mail.com"));
  assert.equal(updateRequest?.headers.get("content-type"), "application/vnd.ui.trinity.minimalmailaddress-v3+json");
  assert.deepEqual(JSON.parse(updateRequest?.body ?? "{}"), {
    displayName: "New Name",
    type: "MANAGED",
    entryDate: "2026-05-24T01:17:11Z",
    address: "user@mail.com",
    defaultSenderAddress: true,
    defaultReceiverAddress: true,
    pgpEnabled: false,
    deletable: false,
  });
});

test("markSpam and markNotSpam use folderType batch updates", async () => {
  const store = new MemorySessionStore();
  await store.save("user@mail.com", {
    accessToken: "access",
    refreshToken: "refresh",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const { fetch, requests } = mockFetch([
    new Response(null, { status: 200 }),
    jsonResponse({ "123": { status: 204, detail: "SUCCESS" } }),
    jsonResponse({ "123": { status: 204, detail: "SUCCESS" } }),
  ]);

  const client = new MailComClient({
    email: "user@mail.com",
    sessionStore: store,
    fetch,
  });

  await client.login();
  await client.actions.markSpam("123");
  await client.actions.markNotSpam("123");

  assert.deepEqual(JSON.parse(requests[1]?.body ?? "{}"), {
    folderType: "SPAM",
    flagged: false,
    mailURIs: ["../../Mail/123"],
  });
  assert.deepEqual(JSON.parse(requests[2]?.body ?? "{}"), {
    folderType: "INBOX",
    flagged: false,
    mailURIs: ["../../Mail/123"],
  });
});

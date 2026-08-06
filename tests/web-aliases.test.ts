import assert from "node:assert/strict";
import test from "node:test";
import { MAILCOM_ALIAS_DOMAINS, MailComWebAliasAddon } from "../src/web-aliases.js";

type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

type QueuedResponse = Response | ((requests: RecordedRequest[]) => Response);

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html;charset=UTF-8", ...Object.fromEntries(new Headers(init.headers)) },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}

async function bodyToString(body: BodyInit | null | undefined): Promise<string> {
  if (!body) return "";
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof body === "string") return body;
  if (body instanceof Blob) return body.text();
  return String(body);
}

function mockFetch(responses: QueuedResponse[]): { fetch: typeof fetch; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    requests.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: await bodyToString(init.body),
    });
    const queued = responses.shift();
    if (!queued) throw new Error("No mock response queued");
    return typeof queued === "function" ? queued(requests) : queued;
  };
  return { fetch: fetchImpl, requests };
}

type AliasInput = {
  address: string;
  displayName?: string;
  deletable?: boolean;
  defaultSenderAddress?: boolean;
  defaultReceiverAddress?: boolean;
};

function alias(input: AliasInput): Record<string, unknown> {
  return {
    type: "MANAGED",
    entryDate: "2026-08-06T00:00:00Z",
    address: input.address,
    displayName: input.displayName ?? "",
    deletable: input.deletable ?? true,
    pgpEnabled: false,
    defaultSenderAddress: input.defaultSenderAddress ?? false,
    defaultReceiverAddress: input.defaultReceiverAddress ?? false,
    state: "ACTIVE",
    _links: { self: { href: `emailaddresses/${encodeURIComponent(input.address)}` } },
  };
}

function aliasesResponse(inputs: AliasInput[]): Response {
  return jsonResponse({ mailaddresslist: inputs.map(alias) });
}

function domainsResponse(domains: string[]): Response {
  return jsonResponse({ domains: domains.map((domain) => ({ domain, state: "ACTIVE", type: "PRIMARY" })) });
}

function webLoginResponses(): QueuedResponse[] {
  return [
    redirect("https://mlogin.mail.com/oauth2/?client_id=mailcom_mailcheck_chrome&state=state&authcode-context=ctx&login_hint=user%40mail.com"),
    htmlResponse('<input name="service" value="oauth2" />'),
    redirect("https://oauth2.mail.com/authcode?authcode-context=ctx&ott=ott"),
    (requests) => {
      const authorizeRequest = requests.find((request) => request.url.startsWith("https://oauth2.mail.com/authorize"));
      assert.ok(authorizeRequest);
      const state = new URL(authorizeRequest.url).searchParams.get("state");
      return redirect(`https://lpebgcnlaohcgdfhbffjajlnpifdkllg.chromiumapp.org/?code=auth-code&state=${state}`);
    },
    jsonResponse({ access_token: "web-access" }),
    redirect("https://navigator-lxa.mail.com/login?partnerdata=data&origin=toolbar&ott=ott"),
    htmlResponse("<html>navigator login</html>"),
    new Response(null, {
      status: 302,
      headers: {
        location: "https://navigator-lxa.mail.com/?sid=nav-sid",
        "set-cookie": "navigator=session; Path=/; Domain=.navigator-lxa.mail.com",
      },
    }),
    htmlResponse("<html>navigator root</html>"),
    jsonResponse({ access_token: "settings-access", scope: "webmailer_setting_r webmailer_setting_w" }),
  ];
}

function createAddon(fetch: typeof globalThis.fetch): MailComWebAliasAddon {
  return new MailComWebAliasAddon({
    email: "user@mail.com",
    password: "password",
    fetch,
    settingsOAuthBasicAuth: "Basic settings-client",
  });
}

test("web alias addon logs in through the settings OAuth bridge and lists live domains", async () => {
  const { fetch, requests } = mockFetch([...webLoginResponses(), domainsResponse(["mail.com", "email.com", "example.org"])]);
  const addon = createAddon(fetch);

  assert.deepEqual(await addon.availableDomains(), ["email.com", "mail.com"]);

  const bridge = requests.find((request) => request.url.startsWith("https://oauthbridge.navigator-lxa.mail.com/"));
  assert.ok(bridge);
  assert.equal(bridge.method, "POST");
  assert.equal(bridge.headers.get("authorization"), "Basic settings-client");
  assert.match(bridge.headers.get("cookie") ?? "", /navigator=session/);
  assert.equal(new URLSearchParams(bridge.body).get("grant_type"), "urn:mam:oauth:grant-type:spa");
  assert.match(new URLSearchParams(bridge.body).get("scope") ?? "", /webmailer_setting_w/);

  const domains = requests.find((request) => request.url.startsWith("https://settings-cats.mail.com/domains"));
  assert.equal(domains?.headers.get("authorization"), "Bearer settings-access");
});

test("web alias addon validates, creates, verifies, and deletes aliases through settings-cats", async () => {
  const primary = { address: "user@mail.com", deletable: false, defaultSenderAddress: true };
  const created = { address: "sdkalias@mail.com" };
  const { fetch, requests } = mockFetch([
    ...webLoginResponses(),
    aliasesResponse([primary]),
    domainsResponse(["mail.com", "email.com"]),
    jsonResponse({}),
    jsonResponse({}, 204),
    aliasesResponse([primary, created]),
    aliasesResponse([primary, created]),
    jsonResponse({}, 204),
    aliasesResponse([primary]),
  ]);
  const addon = createAddon(fetch);

  assert.deepEqual(await addon.createAlias("sdkalias@mail.com"), { address: "sdkalias@mail.com" });
  await addon.deleteAlias("sdkalias@mail.com");

  const create = requests.find(
    (request) => request.method === "POST" && new URL(request.url).pathname === "/mailaccount/primary/emailAddresses",
  );
  assert.ok(create);
  assert.equal(create.headers.get("accept"), "application/vnd.ui.trinity.minimalmailaddress-v3+json");
  assert.equal(create.headers.get("content-type"), "application/vnd.ui.trinity.minimalmailaddress-v3+json");
  assert.deepEqual(JSON.parse(create.body), {
    address: "sdkalias@mail.com",
    deletable: true,
    pgpEnabled: false,
    defaultSenderAddress: false,
    defaultReceiverAddress: false,
    state: "ACTIVE",
  });

  const deletion = requests.find((request) => request.url.includes("emailAddressesRemovals/sdkalias%40mail.com/removals"));
  assert.ok(deletion);
  assert.equal(deletion.method, "POST");
  assert.equal(deletion.body, "");
});

test("web alias addon exposes and changes default sender variants through settings-cats", async () => {
  const named = { address: "sdkalias@mail.com", displayName: "SDK Probe" };
  const namedDefault = { ...named, defaultSenderAddress: true };
  const emailDefault = { address: "sdkalias@mail.com", displayName: "", defaultSenderAddress: true };
  const { fetch, requests } = mockFetch([
    ...webLoginResponses(),
    aliasesResponse([named]),
    aliasesResponse([named]),
    jsonResponse({}, 204),
    aliasesResponse([namedDefault]),
    aliasesResponse([namedDefault]),
    jsonResponse({}, 204),
    aliasesResponse([emailDefault]),
  ]);
  const addon = createAddon(fetch);

  assert.deepEqual(await addon.defaultSenderOptions("sdkalias@mail.com"), [
    { value: "email", label: "sdkalias@mail.com", sender: "email", selected: false },
    { value: "name-email", label: '"SDK Probe" <sdkalias@mail.com>', sender: "name-email", selected: false },
  ]);
  await addon.setDefaultAlias("sdkalias@mail.com", { sender: "name-email" });
  await addon.setDefaultAlias("sdkalias@mail.com", { sender: "email" });

  const updates = requests.filter(
    (request) => request.method === "PUT" && request.url.includes("/emailAddresses/sdkalias%40mail.com"),
  );
  assert.equal(updates.length, 2);
  assert.equal(JSON.parse(updates[0]?.body ?? "{}").displayName, "SDK Probe");
  assert.equal(JSON.parse(updates[1]?.body ?? "{}").displayName, "");
  assert.equal(JSON.parse(updates[0]?.body ?? "{}").defaultSenderAddress, true);
});

test("web alias addon rejects unavailable aliases before attempting creation", async () => {
  const { fetch, requests } = mockFetch([
    ...webLoginResponses(),
    aliasesResponse([{ address: "user@mail.com", deletable: false, defaultSenderAddress: true }]),
    domainsResponse(["mail.com"]),
    jsonResponse({ "taken@mail.com": "ALREADY_EXISTS" }),
  ]);
  const addon = createAddon(fetch);

  await assert.rejects(() => addon.createAlias("taken@mail.com"), /Alias address is not available/);
  assert.equal(
    requests.some(
      (request) => request.method === "POST" && new URL(request.url).pathname === "/mailaccount/primary/emailAddresses",
    ),
    false,
  );
});

test("web alias addon rejects non-deletable default addresses without sending removal", async () => {
  const { fetch, requests } = mockFetch([
    ...webLoginResponses(),
    aliasesResponse([{ address: "user@mail.com", deletable: false, defaultSenderAddress: true }]),
  ]);
  const addon = createAddon(fetch);

  await assert.rejects(() => addon.deleteAlias("user@mail.com"), /not allowed for deletion/);
  assert.equal(requests.some((request) => request.url.includes("emailAddressesRemovals")), false);
});

test("web alias addon surfaces settings-cats deletion conflicts", async () => {
  const { fetch } = mockFetch([
    ...webLoginResponses(),
    aliasesResponse([{ address: "default@mail.com", deletable: true, defaultSenderAddress: true }]),
    jsonResponse({ title: "Address is not allowed for deletion" }, 409),
  ]);
  const addon = createAddon(fetch);

  await assert.rejects(() => addon.deleteAlias("default@mail.com"), /failed with 409.*not allowed for deletion/i);
});

test("web alias addon exports the known mail.com alias domain allowlist", () => {
  assert.equal(MAILCOM_ALIAS_DOMAINS.length, new Set(MAILCOM_ALIAS_DOMAINS).size);
  assert.ok(MAILCOM_ALIAS_DOMAINS.includes("mail.com"));
  assert.ok(MAILCOM_ALIAS_DOMAINS.includes("email.com"));
  assert.ok(MAILCOM_ALIAS_DOMAINS.includes("myself.com"));
  assert.ok(MAILCOM_ALIAS_DOMAINS.includes("workmail.com"));
  assert.ok(MAILCOM_ALIAS_DOMAINS.includes("2trom.com"));
  assert.ok(MAILCOM_ALIAS_DOMAINS.includes("cheerful.com"));
});

test("web alias addon rejects unsupported domains before opening webmail", async () => {
  const { fetch, requests } = mockFetch([]);
  const addon = createAddon(fetch);

  await assert.rejects(
    () => addon.createAlias("sdkalias@example.org"),
    /Alias domain is not supported by mail\.com: example\.org/,
  );
  assert.equal(requests.length, 0);
});

test("web alias addon rejects create before posting when alias limit is already reached", async () => {
  const aliases = Array.from({ length: 10 }, (_, index) => ({
    address: `alias${index}@mail.com`,
    defaultSenderAddress: index === 0,
  }));
  const { fetch, requests } = mockFetch([...webLoginResponses(), aliasesResponse(aliases)]);
  const addon = createAddon(fetch);

  await assert.rejects(
    () => addon.createAlias("extra@mail.com"),
    /The maximum number of Alias Addresses has been created\. This e-mail-address could not be created/,
  );
  assert.equal(requests.some((request) => request.url.startsWith("https://settings-cats.mail.com/domains")), false);
});

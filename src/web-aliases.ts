import { randomBytes } from "node:crypto";
import { MailComApiError, MailComAuthError, MailComValidationError } from "./errors.js";
import type { FetchLike } from "./types.js";

const WEB_OAUTH_CLIENT_ID = "mailcom_mailcheck_chrome";
const WEB_OAUTH_REDIRECT_URI = "https://lpebgcnlaohcgdfhbffjajlnpifdkllg.chromiumapp.org/";
const DEFAULT_WEB_OAUTH_BASIC_AUTH =
  "Basic bWFpbGNvbV9tYWlsY2hlY2tfY2hyb21lOnRJWkNZWjFZOFFhNUt0MjJMVXJXSDJTc29td1VhV1F5dGszWWdNem4=";
const MAIL_SETTINGS_PARTNER_DATA =
  "eyJ1c2VjYXNlIjoiaW5ib3hfdW5yZWFkIiwiYXJncyI6W10sImlkIjoyLCJjYWxsZXJfYXBwIjoidG9vbGJhciIsImNhbGxlcl92ZXJzaW9uIjoiQ2hyb21lLzguMC41LjAifQ==";
const WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const MAILCOM_ALIAS_LIMIT = 10;

export type DefaultAliasSender = "email" | "name-email";

export interface MailComWebAliasAddonOptions {
  email: string;
  password: string;
  fetch?: FetchLike;
  oauthBasicAuth?: string;
  userAgent?: string;
}

export interface CreateWebAliasInput {
  address: string;
}

export interface WebAliasMutationResult {
  address: string;
}

export interface SetDefaultAliasOptions {
  sender?: DefaultAliasSender;
}

export interface DefaultSenderOption {
  value: string;
  label: string;
  sender: DefaultAliasSender;
  selected: boolean;
}

interface AliasPageState {
  url: string;
  html: string;
}

interface AjaxTarget {
  url: string;
  component?: string;
}

interface AliasRow {
  rowId: string;
  address: string;
  defaultSender: boolean;
}

class CookieJar {
  private readonly cookies = new Map<string, string>();

  addFrom(response: Response): void {
    const withSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = withSetCookie.getSetCookie?.() ?? [];
    const fallback = response.headers.get("set-cookie");

    for (const cookie of setCookies.length ? setCookies : fallback ? [fallback] : []) {
      const pair = cookie.split(";")[0];
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      this.cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }

  header(): string {
    return [...this.cookies].map(([key, value]) => `${key}=${value}`).join("; ");
  }
}

export class MailComWebAliasAddon {
  private readonly email: string;
  private readonly password: string;
  private readonly fetchImpl: FetchLike;
  private readonly oauthBasicAuth: string;
  private readonly userAgent: string;
  private readonly cookies = new CookieJar();
  private page: AliasPageState | null = null;

  constructor(options: MailComWebAliasAddonOptions) {
    this.email = options.email;
    this.password = options.password;
    this.fetchImpl = options.fetch ?? fetch;
    this.oauthBasicAuth = options.oauthBasicAuth ?? DEFAULT_WEB_OAUTH_BASIC_AUTH;
    this.userAgent = options.userAgent ?? WEB_USER_AGENT;
  }

  async login(): Promise<void> {
    this.page = await this.openAliasesPage();
  }

  async createAlias(input: string | CreateWebAliasInput): Promise<WebAliasMutationResult> {
    const requestedAddress = typeof input === "string" ? input : input.address;
    const { localPart, domain, address } = splitAliasAddress(requestedAddress);
    const page = await this.ensurePage();
    const rows = extractAliasRows(page.html);
    if (rows.length >= MAILCOM_ALIAS_LIMIT) {
      throw new MailComValidationError(`mail.com allows at most ${MAILCOM_ALIAS_LIMIT} total addresses.`);
    }

    const domainOption = domainOptions(page.html).find((option) => option.domain.toLowerCase() === domain.toLowerCase());
    if (!domainOption) throw new MailComValidationError(`Alias domain is not available: ${domain}`);

    const form = aliasCreateForm(page.html);
    const target = extractAjaxTarget(page.html, "internalAliasChapter");
    const body = new URLSearchParams();
    body.set(form.localPartName, localPart);
    body.set(form.domainName, domainOption.value);
    body.set("fieldSet:fieldSet_body:grid:button:button", "1");

    const response = await this.requestText(absoluteUrl(page.url, target.url), {
      method: "POST",
      headers: this.wicketHeaders(page.url, target.component, true),
      body,
    });

    this.page = { url: page.url, html: response };
    if (!containsAddress(response, address)) {
      throw new MailComValidationError(`Alias was not created: ${address}`);
    }

    return { address };
  }

  async deleteAlias(address: string): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const page = await this.pageForAttempt(attempt);
        const row = rowForAddress(page.html, address);
        if (!row) throw new MailComValidationError(`Alias not found: ${address}`);
        if (row.defaultSender) throw new MailComValidationError(`Default sender alias cannot be deleted: ${address}`);

        const deleteTarget = extractAjaxTarget(page.html, "hoverIcons-2-hoverIcon");
        const dialog = await this.requestText(
          withQuery(absoluteUrl(page.url, deleteTarget.url), { rowId: row.rowId, _: String(Date.now()) }),
          { headers: this.wicketHeaders(page.url, deleteTarget.component) },
        );

        const confirmTarget = extractAjaxTarget(dialog, "buttonContainer-primary");
        const response = await this.requestText(
          withQuery(absoluteUrl(page.url, confirmTarget.url), { _: String(Date.now()) }),
          { headers: this.wicketHeaders(page.url, confirmTarget.component) },
        );

        this.page = { url: page.url, html: response };
        if (containsAddress(response, address)) {
          throw new MailComValidationError(`Alias was not deleted: ${address}`);
        }
        return;
      } catch (error) {
        lastError = error;
        if (attempt === 2) break;
        await delay(1000 * (attempt + 1));
      }
    }
    throw lastError;
  }

  async defaultSenderOptions(address: string): Promise<DefaultSenderOption[]> {
    const { options } = await this.defaultSenderDialogWithOptions(address);
    return options;
  }

  async setDefaultAlias(address: string, options: SetDefaultAliasOptions = {}): Promise<void> {
    const sender = options.sender ?? "email";
    const { page, dialog, options: choices } = await this.defaultSenderDialogWithOptions(address);
    const choice = choices.find((item) => item.sender === sender);
    if (!choice) throw new MailComValidationError(`Default sender option not available for ${address}: ${sender}`);

    const okTarget = extractAjaxTarget(dialog, "buttonContainer_body-ok");
    const body = new URLSearchParams();
    body.set("defaultSenderRadioGroup:radioGroup", choice.value);
    body.set("buttonContainer:container:buttonContainer_body:ok", "1");

    const response = await this.requestText(absoluteUrl(page.url, okTarget.url), {
      method: "POST",
      headers: this.wicketHeaders(page.url, okTarget.component, true),
      body,
    });
    this.page = { url: page.url, html: response };
  }

  private async ensurePage(): Promise<AliasPageState> {
    if (this.page) return this.page;
    await this.login();
    if (!this.page) throw new MailComAuthError("Could not open mail.com alias settings.");
    return this.page;
  }

  private async pageForAttempt(attempt: number): Promise<AliasPageState> {
    if (attempt === 0) return this.ensurePage();
    this.page = await this.openAliasesPage();
    return this.page;
  }

  private async defaultSenderDialogWithOptions(
    address: string,
  ): Promise<{ page: AliasPageState; dialog: string; options: DefaultSenderOption[] }> {
    let lastDialog = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const page = await this.pageForAttempt(attempt);
      const dialog = await this.openDefaultSenderDialog(page, address);
      const options = parseDefaultSenderOptions(dialog);
      if (options.length > 0) return { page, dialog, options };
      lastDialog = dialog;
      await delay(1000 * (attempt + 1));
    }
    throw new MailComValidationError(
      `Default sender options were not available for ${address}.${lastDialog ? " The mail.com dialog was empty." : ""}`,
    );
  }

  private async openDefaultSenderDialog(page: AliasPageState, address: string): Promise<string> {
    const row = rowForAddress(page.html, address);
    if (!row) throw new MailComValidationError(`Alias not found: ${address}`);

    const editTarget = extractAjaxTarget(page.html, "hoverIcons-1-hoverIcon");
    return this.requestText(
      withQuery(absoluteUrl(page.url, editTarget.url), { rowId: row.rowId, _: String(Date.now()) }),
      { headers: this.wicketHeaders(page.url, editTarget.component) },
    );
  }

  private async openAliasesPage(): Promise<AliasPageState> {
    const state = randomBytes(12).toString("hex");
    const authorizeUrl = new URL("https://oauth2.mail.com/authorize");
    authorizeUrl.search = new URLSearchParams({
      client_id: WEB_OAUTH_CLIENT_ID,
      redirect_uri: WEB_OAUTH_REDIRECT_URI,
      scope: "mailbox_user_status_access mailbox_user_full_access login",
      response_type: "code",
      hl: "en-US",
      state,
      login_hint: this.email,
    }).toString();

    const authorize = await this.request(authorizeUrl.href, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const mloginUrl = redirectLocation(authorize, authorizeUrl.href);

    const mlogin = await this.request(mloginUrl, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const loginHtml = await mlogin.text();
    const loginParams = loginFormParams(loginHtml, mloginUrl);
    loginParams.set("username", this.email);
    loginParams.set("password", this.password);

    const login = await this.request("https://login.mail.com/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://mlogin.mail.com",
        Referer: "https://mlogin.mail.com/",
      },
      body: loginParams,
    });

    const authcode = await this.request(redirectLocation(login, "https://login.mail.com/"), {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const code = new URL(redirectLocation(authcode, "https://oauth2.mail.com/")).searchParams.get("code");
    if (!code) throw new MailComAuthError("mail.com web OAuth did not return an authorization code.");

    const tokenResponse = await this.request("https://oauth2.mail.com/token", {
      method: "POST",
      headers: {
        Authorization: this.oauthBasicAuth,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "chrome-extension://lpebgcnlaohcgdfhbffjajlnpifdkllg",
      },
      body: new URLSearchParams({
        code,
        client_id: WEB_OAUTH_CLIENT_ID,
        redirect_uri: WEB_OAUTH_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const token = (await tokenResponse.json()) as { access_token?: string };
    if (!token.access_token) throw new MailComAuthError("mail.com web OAuth did not return an access token.");

    const oauth2Login = await this.request("https://login.mail.com/oauth2login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://dl.mail.com",
        Referer: "https://dl.mail.com/",
      },
      body: new URLSearchParams({
        service: "mailint",
        origin: "toolbar",
        access_token: token.access_token,
        successURL: "https://navigator-lxa.mail.com/login",
        loginFailedURL: "http://www.mail.com/logoutlounge",
        loginErrorURL: "http://www.mail.com/?status=nologin",
        statistics: "",
        partnerdata: MAIL_SETTINGS_PARTNER_DATA,
      }),
    });

    const navigatorLoginUrl = new URL(redirectLocation(oauth2Login, "https://login.mail.com/"));
    await this.request(navigatorLoginUrl.href, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    navigatorLoginUrl.pathname = "/halogin";
    navigatorLoginUrl.searchParams.set("tz", "5.5");

    const halogin = await this.request(navigatorLoginUrl.href, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const navigatorRootUrl = new URL(redirectLocation(halogin, navigatorLoginUrl.href));
    const sid = navigatorRootUrl.searchParams.get("sid");
    if (!sid) throw new MailComAuthError("mail.com navigator login did not return a session id.");

    await this.request(navigatorRootUrl.href, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });

    const settingsJump = await this.request(
      `https://navigator-lxa.mail.com/navigator/jump/to/mail_settings?sid=${encodeURIComponent(sid)}`,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Referer: `https://navigator-lxa.mail.com/mail?sid=${encodeURIComponent(sid)}`,
        },
      },
    );

    const settingsEntryUrl = redirectLocation(settingsJump, "https://navigator-lxa.mail.com/");
    const settingsEntry = await this.request(settingsEntryUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://navigator-lxa.mail.com/",
      },
    });
    const signatureUrl = redirectLocation(settingsEntry, settingsEntryUrl);
    await this.request(signatureUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: "https://navigator-lxa.mail.com/",
      },
    });

    const jsessionId = signatureUrl.match(/;jsessionid=([^?]+)/)?.[1];
    if (!jsessionId) throw new MailComAuthError("mail.com settings did not return a Wicket session id.");

    const aliasPageUrl = `https://3c-lxa.mail.com/mail/client/settings/allEmailAddresses;jsessionid=${jsessionId}`;
    const aliasPage = await this.request(aliasPageUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: signatureUrl,
      },
    });

    return { url: aliasPageUrl, html: await aliasPage.text() };
  }

  private wicketHeaders(referer: string, component: string | undefined, form = false): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/xml, text/xml, */*; q=0.01",
      Referer: referer,
      "Wicket-Ajax": "true",
      "Wicket-Ajax-BaseURL": "settings/allEmailAddresses",
      "X-Requested-With": "XMLHttpRequest",
    };
    if (component) headers["Wicket-FocusedElementId"] = component;
    if (form) {
      headers.Origin = "https://3c-lxa.mail.com";
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    }
    return headers;
  }

  private async requestText(url: string, init: RequestInit): Promise<string> {
    return (await this.request(url, init)).text();
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.cookies.header();
    if (cookie) headers.set("Cookie", cookie);
    if (!headers.has("User-Agent")) headers.set("User-Agent", this.userAgent);
    if (!headers.has("Accept-Language")) headers.set("Accept-Language", "en-US,en;q=0.9");

    const response = await this.fetchImpl(url, { ...init, headers, redirect: "manual" });
    this.cookies.addFrom(response);
    if (!response.ok && !isRedirect(response.status)) {
      const body = await response.text().catch(() => undefined);
      throw new MailComApiError({
        message: `${init.method ?? "GET"} ${url} failed with ${response.status}${body ? `: ${truncate(body)}` : ""}`,
        status: response.status,
        method: init.method ?? "GET",
        url,
        ...(body !== undefined ? { body } : {}),
      });
    }
    return response;
  }
}

function loginFormParams(html: string, pageUrl: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const input of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = input[0];
    const name = tag.match(/\bname=(["'])(.*?)\1/i)?.[2];
    if (!name) continue;
    params.set(name, htmlDecode(tag.match(/\bvalue=(["'])(.*?)\1/i)?.[2] ?? ""));
  }

  if (!params.has("service")) params.set("service", "oauth2");
  if (!params.has("successURL")) {
    const authcodeContext = new URL(pageUrl).searchParams.get("authcode-context");
    if (!authcodeContext) throw new MailComAuthError("mail.com login page did not include authcode-context.");
    params.set("successURL", `https://oauth2.mail.com/authcode?authcode-context=${authcodeContext}`);
    params.set(
      "loginFailedURL",
      `https://mlogin.mail.com/oauth2/?status=login-failed&login_hint=${encodeURIComponent(
        new URL(pageUrl).searchParams.get("login_hint") ?? "",
      )}&authcode-context=${authcodeContext}`,
    );
    params.set("loginErrorURL", "https://mlogin.mail.com/loginapplication/error/loginerror");
  }
  return params;
}

function redirectLocation(response: Response, baseUrl: string): string {
  const location = response.headers.get("location");
  if (!isRedirect(response.status) || !location) {
    throw new MailComAuthError(`Expected mail.com redirect, got ${response.status}.`);
  }
  return new URL(location, baseUrl).href;
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function splitAliasAddress(input: string): { localPart: string; domain: string; address: string } {
  const trimmed = input.trim().toLowerCase();
  const [localPart, domain = "mail.com"] = trimmed.split("@");
  if (!localPart || !domain || trimmed.split("@").length > 2) {
    throw new MailComValidationError(`Invalid alias address: ${input}`);
  }
  if (!/^[a-z0-9._-]{3,62}$/.test(localPart)) {
    throw new MailComValidationError("Alias local part must be 3-62 chars using letters, numbers, dots, dashes, or underscores.");
  }
  return { localPart, domain, address: `${localPart}@${domain}` };
}

function aliasCreateForm(html: string): { localPartName: string; domainName: string } {
  const localPartName = html.match(/<input[^>]+name="([^"]*addressSelection:localPart[^"]*)"/i)?.[1];
  const domainName = html.match(/<select[^>]+name="([^"]*addressSelection:domainSelection[^"]*)"/i)?.[1];
  if (!localPartName || !domainName) throw new MailComValidationError("Alias creation form was not found.");
  return { localPartName, domainName };
}

function domainOptions(html: string): Array<{ value: string; domain: string }> {
  const select = html.match(/<select[^>]+name="[^"]*addressSelection:domainSelection[^"]*"[\s\S]*?<\/select>/i)?.[0];
  if (!select) throw new MailComValidationError("Alias domain selector was not found.");
  return [...select.matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>([^<]+)<\/option>/gi)].map((match) => ({
    value: htmlDecode(match[1] ?? ""),
    domain: htmlDecode(match[2] ?? "").trim().toLowerCase(),
  }));
}

function extractAliasRows(html: string): AliasRow[] {
  const rows: AliasRow[] = [];
  const rowPattern =
    /<div\b[^>]*class="[^"]*\btable_body-row\b[^"]*"[^>]*data-row-id="([^"]+)"[^>]*>[\s\S]*?(?=<div\b[^>]*class="[^"]*\btable_body-row\b|<div\b[^>]*class="[^"]*\bjs-template\b|<script\b|<\/ajax-response>|$)/gi;
  for (const match of html.matchAll(rowPattern)) {
    const rowId = match[1];
    const block = match[0];
    const address = htmlDecode(block.replace(/<[^>]+>/g, " ")).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    if (!rowId || !address) continue;
    rows.push({ rowId, address: address.toLowerCase(), defaultSender: /Default sender address/i.test(block) });
  }
  return rows;
}

function rowForAddress(html: string, address: string): AliasRow | undefined {
  const normalized = address.trim().toLowerCase();
  return extractAliasRows(html).find((row) => row.address === normalized);
}

function containsAddress(html: string, address: string): boolean {
  return htmlDecode(html).toLowerCase().includes(address.trim().toLowerCase());
}

function extractAjaxTarget(html: string, contains: string): AjaxTarget {
  for (const match of html.matchAll(/"u":"([^"]+)"/g)) {
    const url = htmlDecode(match[1] ?? "");
    if (!url.includes(contains)) continue;
    return ajaxTargetFromMatch(html, match, url);
  }

  for (const match of html.matchAll(/"u":"([^"]+)"/g)) {
    const url = htmlDecode(match[1] ?? "");
    const index = match.index ?? 0;
    const window = html.slice(Math.max(0, index - 800), index + 1200);
    if (!url.includes(contains) && !window.includes(contains)) continue;
    return ajaxTargetFromMatch(html, match, url);
  }
  throw new MailComValidationError(`mail.com alias action was not found: ${contains}`);
}

function ajaxTargetFromMatch(html: string, match: RegExpMatchArray, url: string): AjaxTarget {
  const index = match.index ?? 0;
  const window = html.slice(Math.max(0, index - 200), index + 500);
  const component = window.match(/"c":"([^"]+)"/)?.[1];
  return component ? { url, component } : { url };
}

function parseDefaultSenderOptions(html: string): DefaultSenderOption[] {
  return [...html.matchAll(/<li[\s\S]*?<\/li>/gi)]
    .map((match) => {
      const block = match[0];
      const value = block.match(/name="defaultSenderRadioGroup:radioGroup"[^>]*value="([^"]+)"/i)?.[1];
      const label = htmlDecode((block.match(/<label[^>]*>([\s\S]*?)<\/label>/i)?.[1] ?? "").replace(/<[^>]+>/g, " "))
        .replace(/\s+/g, " ")
        .trim();
      if (!value || !label) return null;
      return {
        value,
        label,
        sender: label.includes("<") && label.includes(">") ? "name-email" : "email",
        selected: /\bchecked(?:="checked")?/i.test(block),
      } satisfies DefaultSenderOption;
    })
    .filter((item): item is DefaultSenderOption => Boolean(item));
}

function absoluteUrl(baseUrl: string, value: string): string {
  return new URL(value, baseUrl).href;
}

function withQuery(url: string, query: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(query)) parsed.searchParams.set(key, value);
  return parsed.href;
}

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function truncate(value: string, length = 300): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import { randomBytes, randomUUID } from "node:crypto";
import { MailComApiError, MailComAuthError, MailComValidationError } from "./errors.js";
import type { FetchLike } from "./types.js";
import { MAILCOM_ALIAS_DOMAINS } from "./web-alias-domains.js";

export { MAILCOM_ALIAS_DOMAINS } from "./web-alias-domains.js";
export type { MailComAliasDomain } from "./web-alias-domains.js";

const WEB_OAUTH_CLIENT_ID = "mailcom_mailcheck_chrome";
const WEB_OAUTH_REDIRECT_URI = "https://lpebgcnlaohcgdfhbffjajlnpifdkllg.chromiumapp.org/";
const DEFAULT_WEB_OAUTH_BASIC_AUTH =
  "Basic bWFpbGNvbV9tYWlsY2hlY2tfY2hyb21lOnRJWkNZWjFZOFFhNUt0MjJMVXJXSDJTc29td1VhV1F5dGszWWdNem4=";
const DEFAULT_SETTINGS_OAUTH_BASIC_AUTH = "Basic bWFpbGNvbV9tYWlsc2V0X3Jvb3RfbGl2ZToqKioqKioq";
const MAIL_SETTINGS_PARTNER_DATA =
  "eyJ1c2VjYXNlIjoiaW5ib3hfdW5yZWFkIiwiYXJncyI6W10sImlkIjoyLCJjYWxsZXJfYXBwIjoidG9vbGJhciIsImNhbGxlcl92ZXJzaW9uIjoiQ2hyb21lLzguMC41LjAifQ==";
const SETTINGS_CATS_BASE_URL = "https://settings-cats.mail.com";
const SETTINGS_OAUTH_BRIDGE_URL = "https://oauthbridge.navigator-lxa.mail.com/navigator/oauth2/token";
const SETTINGS_OAUTH_GRANT_TYPE = "urn:mam:oauth:grant-type:spa";
const SETTINGS_OAUTH_SCOPE = "mail_mailbox_w webmailer_setting_r webmailer_setting_w mail_confix_w";
const SETTINGS_UI_APP = "mailcom.mailset-compose/1.0.5-build.322";
const WEB_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const MAILCOM_ALIAS_LIMIT = 10;
const MAILCOM_ALIAS_LIMIT_MESSAGE =
  "The maximum number of Alias Addresses has been created. This e-mail-address could not be created";
const MAILCOM_ALIAS_DOMAIN_SET = new Set<string>(MAILCOM_ALIAS_DOMAINS);

export type DefaultAliasSender = "email" | "name-email";

export interface MailComWebAliasAddonOptions {
  email: string;
  password: string;
  fetch?: FetchLike;
  oauthBasicAuth?: string;
  settingsOAuthBasicAuth?: string;
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

interface SettingsAlias {
  type?: string;
  entryDate?: string;
  address: string;
  displayName?: string;
  deletable?: boolean;
  pgpEnabled?: boolean;
  defaultSenderAddress?: boolean;
  defaultReceiverAddress?: boolean;
  state?: string;
  _links?: {
    self?: { href?: string };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SettingsAliasesResponse {
  mailaddresslist?: SettingsAlias[];
}

interface SettingsDomain {
  domain?: string;
  state?: string;
}

interface SettingsDomainsResponse {
  domains?: SettingsDomain[];
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
  private readonly settingsOAuthBasicAuth: string;
  private readonly userAgent: string;
  private readonly cookies = new CookieJar();
  private settingsAccessToken: string | null = null;

  constructor(options: MailComWebAliasAddonOptions) {
    this.email = options.email;
    this.password = options.password;
    this.fetchImpl = options.fetch ?? fetch;
    this.oauthBasicAuth = options.oauthBasicAuth ?? DEFAULT_WEB_OAUTH_BASIC_AUTH;
    this.settingsOAuthBasicAuth = options.settingsOAuthBasicAuth ?? DEFAULT_SETTINGS_OAUTH_BASIC_AUTH;
    this.userAgent = options.userAgent ?? WEB_USER_AGENT;
  }

  async login(): Promise<void> {
    this.settingsAccessToken = await this.openSettingsSession();
  }

  async createAlias(input: string | CreateWebAliasInput): Promise<WebAliasMutationResult> {
    const requestedAddress = typeof input === "string" ? input : input.address;
    const { domain, address } = splitAliasAddress(requestedAddress);
    if (!MAILCOM_ALIAS_DOMAIN_SET.has(domain)) {
      throw new MailComValidationError(`Alias domain is not supported by mail.com: ${domain}`);
    }

    const aliases = await this.listAliases();
    if (aliases.length >= MAILCOM_ALIAS_LIMIT) throw new MailComValidationError(MAILCOM_ALIAS_LIMIT_MESSAGE);
    if (aliases.some((alias) => alias.address.toLowerCase() === address)) {
      throw new MailComValidationError(`Alias already exists: ${address}`);
    }

    const availableDomains = await this.availableDomains();
    if (!availableDomains.includes(domain)) {
      throw new MailComValidationError(`Alias domain is not available: ${domain}`);
    }

    await this.validateAddressAvailable(address);
    await this.settingsRequest("/mailaccount/primary/emailAddresses?absoluteURI=false", {
      method: "POST",
      headers: {
        Accept: "application/vnd.ui.trinity.minimalmailaddress-v3+json",
        "Content-Type": "application/vnd.ui.trinity.minimalmailaddress-v3+json",
      },
      body: JSON.stringify({
        address,
        deletable: true,
        pgpEnabled: false,
        defaultSenderAddress: false,
        defaultReceiverAddress: false,
        state: "ACTIVE",
      }),
    });

    await this.waitForAlias(address, true);
    return { address };
  }

  async deleteAlias(address: string): Promise<void> {
    const normalized = splitAliasAddress(address).address;
    const alias = await this.findAlias(normalized);
    if (!alias) throw new MailComValidationError(`Alias not found: ${normalized}`);
    if (alias.deletable === false) throw new MailComValidationError(`Alias is not allowed for deletion: ${normalized}`);

    await this.settingsRequest(
      `/mailaccount/primary/emailAddressesRemovals/${encodeURIComponent(normalized)}/removals?absoluteURI=false`,
      {
        method: "POST",
        headers: {
          Accept: "text/plain;charset=UTF-8",
          "Content-Type": "text/plain;charset=UTF-8",
        },
      },
    );
    await this.waitForAlias(normalized, false);
  }

  async availableDomains(): Promise<string[]> {
    const response = await this.settingsJson<SettingsDomainsResponse>(
      "/domains?absoluteURI=false&q.state.eq=ACTIVE&q.legacySupport.eq=true",
      { headers: { Accept: "application/json", "Content-Type": "application/json" } },
    );
    const serverDomains = new Set(
      (response.domains ?? [])
        .flatMap((item) => item.domain?.trim().toLowerCase() ?? [])
        .filter((domain) => domain.length > 0),
    );
    return MAILCOM_ALIAS_DOMAINS.filter((domain) => serverDomains.has(domain));
  }

  async defaultSenderOptions(address: string): Promise<DefaultSenderOption[]> {
    const normalized = splitAliasAddress(address).address;
    const alias = await this.findAlias(normalized);
    if (!alias) throw new MailComValidationError(`Alias not found: ${normalized}`);

    const displayName = alias.displayName?.trim() ?? "";
    const options: DefaultSenderOption[] = [
      {
        value: "email",
        label: alias.address,
        sender: "email",
        selected: alias.defaultSenderAddress === true && !displayName,
      },
    ];
    if (displayName) {
      options.push({
        value: "name-email",
        label: `${JSON.stringify(displayName)} <${alias.address}>`,
        sender: "name-email",
        selected: alias.defaultSenderAddress === true,
      });
    }
    return options;
  }

  async setDefaultAlias(address: string, options: SetDefaultAliasOptions = {}): Promise<void> {
    const normalized = splitAliasAddress(address).address;
    const sender = options.sender ?? "email";
    const alias = await this.findAlias(normalized);
    if (!alias) throw new MailComValidationError(`Alias not found: ${normalized}`);
    if (sender === "name-email" && !alias.displayName?.trim()) {
      throw new MailComValidationError(`Default sender option not available for ${normalized}: name-email`);
    }

    const identifier = aliasIdentifier(alias);
    const payload = minimalAlias(alias, {
      defaultSenderAddress: true,
      ...(sender === "email" ? { displayName: "" } : {}),
    });
    await this.settingsRequest(`/emailAddresses/${identifier}?absoluteURI=false`, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.ui.trinity.minimalmailaddress-v3+json",
        "Content-Type": "application/vnd.ui.trinity.minimalmailaddress-v3+json",
      },
      body: JSON.stringify(payload),
    });

    const updated = await this.findAlias(normalized);
    if (!updated?.defaultSenderAddress) {
      throw new MailComValidationError(`Default sender was not updated: ${normalized}`);
    }
  }

  private async validateAddressAvailable(address: string): Promise<void> {
    const response = await this.settingsJson<Record<string, unknown>>(
      "/mailaccount/emailAddressValidations?absoluteURI=false",
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.ui.trinity.email-address-validation-response+json",
          "Content-Type": "application/vnd.ui.trinity.email-address-validation-request+json",
        },
        body: JSON.stringify([address]),
      },
    );
    if (Object.keys(response).length > 0) {
      throw new MailComValidationError(`Alias address is not available: ${address}`);
    }
  }

  private async findAlias(address: string): Promise<SettingsAlias | undefined> {
    const normalized = address.toLowerCase();
    return (await this.listAliases()).find((alias) => alias.address.toLowerCase() === normalized);
  }

  private async listAliases(): Promise<SettingsAlias[]> {
    const response = await this.settingsJson<SettingsAliasesResponse>(
      "/mailaccount/primary/emailAddresses?absoluteURI=false&q.state.in=ACTIVE&q.type.in=MANAGED%2CDOMAIN_HOSTING",
      {
        headers: {
          Accept: "application/vnd.ui.trinity.mailaddress.list-v5+json",
          "Content-Type": "application/vnd.ui.trinity.mailaddress.list-v5+json",
        },
      },
    );
    return response.mailaddresslist ?? [];
  }

  private async waitForAlias(address: string, shouldExist: boolean): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const found = Boolean(await this.findAlias(address));
      if (found === shouldExist) return;
      if (attempt < 3) await delay(1000 * (attempt + 1));
    }
    throw new MailComValidationError(
      shouldExist ? `Alias was not created: ${address}` : `Alias was not deleted: ${address}`,
    );
  }

  private async ensureSettingsToken(): Promise<string> {
    if (!this.settingsAccessToken) await this.login();
    if (!this.settingsAccessToken) throw new MailComAuthError("Could not obtain mail.com settings access token.");
    return this.settingsAccessToken;
  }

  private async settingsJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    return (await this.settingsRequest(path, init)).json() as Promise<T>;
  }

  private async settingsRequest(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.ensureSettingsToken();
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Origin", "https://mailset-root.mail.com");
    headers.set("Referer", "https://mailset-root.mail.com/");
    headers.set("X-UI-App", SETTINGS_UI_APP);
    headers.set("X-Request-ID", randomUUID());
    return this.request(new URL(path, SETTINGS_CATS_BASE_URL).href, { ...init, headers }, false);
  }

  private async openSettingsSession(): Promise<string> {
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
        Referer: mloginUrl,
      },
      body: loginParams,
    });
    const authcodeUrl = redirectLocation(login, "https://login.mail.com/");
    const authcode = await this.request(authcodeUrl, {
      headers: { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    });
    const callbackUrl = redirectLocation(authcode, "https://oauth2.mail.com/");
    const callback = new URL(callbackUrl);
    const code = callback.searchParams.get("code");
    if (!code) throw new MailComAuthError("mail.com web OAuth did not return an authorization code.");
    if (callback.searchParams.get("state") !== state) throw new MailComAuthError("mail.com web OAuth state mismatch.");

    const tokenResponse = await this.request("https://oauth2.mail.com/token", {
      method: "POST",
      headers: {
        Authorization: this.oauthBasicAuth,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/x-www-form-urlencoded",
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        service: "mailint",
        origin: "toolbar",
        access_token: token.access_token,
        successURL: "https://navigator-lxa.mail.com/login",
        loginFailedURL: "http://www.mail.com/?status=nologin",
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

    const bridgeUrl = new URL(SETTINGS_OAUTH_BRIDGE_URL);
    bridgeUrl.searchParams.set("sid", sid);
    const settingsTokenResponse = await this.request(
      bridgeUrl.href,
      {
        method: "POST",
        headers: {
          Authorization: this.settingsOAuthBasicAuth,
          Accept: "*/*",
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://mailset-root.mail.com",
          Referer: "https://mailset-root.mail.com/",
        },
        body: new URLSearchParams({
          grant_type: SETTINGS_OAUTH_GRANT_TYPE,
          scope: SETTINGS_OAUTH_SCOPE,
        }),
      },
    );
    const settingsToken = (await settingsTokenResponse.json()) as { access_token?: string };
    if (!settingsToken.access_token) {
      throw new MailComAuthError("mail.com settings OAuth bridge did not return an access token.");
    }
    return settingsToken.access_token;
  }

  private async request(url: string, init: RequestInit = {}, includeCookies = true): Promise<Response> {
    const headers = new Headers(init.headers);
    if (includeCookies) {
      const cookie = this.cookies.header();
      if (cookie) headers.set("Cookie", cookie);
    }
    if (!headers.has("User-Agent")) headers.set("User-Agent", this.userAgent);
    if (!headers.has("Accept-Language")) headers.set("Accept-Language", "en-US,en;q=0.9");

    const response = await this.fetchImpl(url, { ...init, headers, redirect: "manual" });
    if (includeCookies) this.cookies.addFrom(response);
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

function aliasIdentifier(alias: SettingsAlias): string {
  const href = alias._links?.self?.href;
  if (href) {
    const marker = "emailaddresses/";
    const index = href.toLowerCase().indexOf(marker);
    if (index >= 0) return href.slice(index + marker.length);
  }
  return encodeURIComponent(alias.address);
}

function minimalAlias(alias: SettingsAlias, patch: Partial<SettingsAlias> = {}): Record<string, unknown> {
  const merged = { ...alias, ...patch };
  return {
    ...(merged.type !== undefined ? { type: merged.type } : {}),
    ...(merged.entryDate !== undefined ? { entryDate: merged.entryDate } : {}),
    address: merged.address,
    ...(merged.displayName !== undefined ? { displayName: merged.displayName } : {}),
    ...(merged.deletable !== undefined ? { deletable: merged.deletable } : {}),
    ...(merged.pgpEnabled !== undefined ? { pgpEnabled: merged.pgpEnabled } : {}),
    ...(merged.defaultSenderAddress !== undefined ? { defaultSenderAddress: merged.defaultSenderAddress } : {}),
    ...(merged.defaultReceiverAddress !== undefined ? { defaultReceiverAddress: merged.defaultReceiverAddress } : {}),
    ...(merged.state !== undefined ? { state: merged.state } : {}),
  };
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

import { APP_HEADERS } from "./constants.js";
import { MailComApiError } from "./errors.js";
import type { FetchLike } from "./types.js";

export type ResponseType = "json" | "text" | "sse" | "binary" | "void" | "raw";

export interface HttpRequestOptions {
  method?: string;
  headers?: HeadersInit;
  auth?: boolean;
  json?: unknown;
  form?: URLSearchParams;
  body?: BodyInit;
  responseType?: ResponseType;
}

export interface BinaryResponse {
  data: ArrayBuffer;
  headers: Headers;
}

export class MailComHttpClient {
  constructor(
    private readonly fetchImpl: FetchLike,
    private readonly getAccessToken: () => string | undefined,
    private readonly onUnauthorized: () => Promise<void>,
  ) {}

  async request<T = unknown>(url: string, options: HttpRequestOptions = {}, retried = false): Promise<T> {
    const method = options.method ?? "GET";
    const headers = new Headers(APP_HEADERS);

    for (const [key, value] of new Headers(options.headers)) {
      headers.set(key, value);
    }

    let body = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    }
    if (options.form) {
      body = options.form;
      if (!headers.has("Content-Type")) headers.set("Content-Type", "application/x-www-form-urlencoded");
    }

    if (options.auth) {
      const accessToken = this.getAccessToken();
      if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const requestInit: RequestInit = { method, headers };
    if (body !== undefined) requestInit.body = body;
    const response = await this.fetchImpl(url, requestInit);

    if (response.status === 401 && options.auth && !retried) {
      await this.onUnauthorized();
      return this.request<T>(url, options, true);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => undefined);
      const bodySnippet = errorBody?.trim();
      const errorInput = {
        message: bodySnippet
          ? `${method} ${url} failed with ${response.status}: ${truncate(bodySnippet)}`
          : `${method} ${url} failed with ${response.status}`,
        status: response.status,
        method,
        url,
        ...(errorBody !== undefined ? { body: errorBody } : {}),
      };
      throw new MailComApiError(errorInput);
    }

    const responseType = options.responseType ?? "json";
    if (responseType === "raw") return response as T;
    if (responseType === "void" || response.status === 204) return undefined as T;
    if (responseType === "text" || responseType === "sse") return (await response.text()) as T;
    if (responseType === "binary") {
      return { data: await response.arrayBuffer(), headers: response.headers } as T;
    }
    return (await response.json()) as T;
  }
}

function truncate(value: string, length = 300): string {
  return value.length > length ? `${value.slice(0, length)}...` : value;
}

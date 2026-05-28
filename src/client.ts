import { createHash, randomBytes } from "node:crypto";
import {
  ANDROID_CLIENT_ID,
  ANDROID_REDIRECT_URI,
  APP_HEADERS,
  DEFAULT_ANDROID_OAUTH_BASIC_AUTH,
  DEFAULT_EXCLUDED_FOLDERS,
  FULL_ACCESS_SCOPE,
  HSP2_BASE_URL,
  MAX_TOTAL_ATTACHMENT_BYTES,
  MIME,
  MOBSI_BASE_URL,
  OAUTH_BASE_URL,
  WEBVIEW_USER_AGENT,
} from "./constants.js";
import { MailComAuthError, MailComError, MailComValidationError } from "./errors.js";
import { MailComHttpClient, type BinaryResponse } from "./http.js";
import { folderUri, mailUri, normalizeAttachmentId, normalizeFolderId, normalizeMailId, parseUriList } from "./id.js";
import { FileSessionStore } from "./session-store.js";
import { parseMailSubmissionResult, parseSseJsonData } from "./sse.js";
import type {
  AddressList,
  AliasesResponse,
  BatchUpdateResult,
  CreateFolderInput,
  DownloadedAttachment,
  FetchLike,
  Folder,
  FoldersResponse,
  ForwardMailInput,
  JsonObject,
  IncomingMailMessage,
  ListMailOptions,
  ListMailResponse,
  ListIncomingOptions,
  ListIncomingResponse,
  MailAttachment,
  MailAttachmentInput,
  MailComClientOptions,
  MailMessage,
  MailPreview,
  MailSubmissionResult,
  MessagesResponse,
  MinimalMailMessageInput,
  OAuthTokenResponse,
  ReplyMailInput,
  SearchMailOptions,
  SendMailInput,
  SessionStore,
  SyncFolderOptions,
  ThumbnailOptions,
  TokenSession,
  UpdateFolderInput,
  UriListResponse,
} from "./types.js";

type MinimalMailPayload = {
  mailHeader: {
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    date: number;
    priority: string;
    dispositionNotificationTo?: string[];
  };
  htmlBody: string;
  attachments: Array<{
    contentType: string;
    filename: string;
    base64data: string;
  }>;
};

const LIST_INCOMING_FOLDER_CONCURRENCY = 5;

export class MailComClient {
  readonly auth: {
    login: () => Promise<TokenSession>;
    refresh: (refreshToken?: string) => Promise<TokenSession>;
    validateToken: (token?: string) => Promise<boolean>;
    logout: () => Promise<void>;
  };

  readonly folders: {
    list: () => Promise<Folder[]>;
    create: (input: string | CreateFolderInput) => Promise<Folder>;
    rename: (folderId: string, name: string) => Promise<Folder>;
    move: (folderId: string, parentFolderId: string) => Promise<Folder>;
    setExpireDays: (folderId: string, days: number) => Promise<Folder>;
    delete: (folderId: string) => Promise<void>;
  };

  readonly mail: {
    search: (query: string, options?: SearchMailOptions) => Promise<MessagesResponse>;
    listByFolder: (folderId: string, options?: ListMailOptions) => Promise<ListMailResponse>;
    listIncoming: (options?: ListIncomingOptions) => Promise<ListIncomingResponse>;
    listAll: (options?: ListIncomingOptions) => Promise<ListIncomingResponse>;
    findBySubject: (subject: string, options?: SearchMailOptions) => Promise<MailMessage[]>;
    findBySender: (sender: string, options?: SearchMailOptions) => Promise<MailMessage[]>;
    syncFolder: (folderId: string, options?: SyncFolderOptions) => Promise<UriListResponse>;
    getBody: (mailId: string, options?: { format?: "html" | "text"; markRead?: boolean }) => Promise<string>;
    getPreview: (mailIds: string | string[]) => Promise<MailPreview[]>;
    send: (input: SendMailInput) => Promise<MailSubmissionResult>;
    reply: (input: ReplyMailInput) => Promise<MailSubmissionResult>;
    forward: (input: ForwardMailInput) => Promise<MailSubmissionResult>;
  };

  readonly drafts: {
    list: () => Promise<MessagesResponse>;
    create: (input: MinimalMailMessageInput) => Promise<MailMessage>;
    update: (draftId: string, input: MinimalMailMessageInput) => Promise<MailMessage>;
    delete: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
  };

  readonly actions: {
    markRead: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    markUnread: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    star: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    unstar: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    markSpam: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    markNotSpam: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    moveToFolder: (mailIds: string | string[], folderId: string) => Promise<BatchUpdateResult>;
    moveToTrash: (mailIds: string | string[]) => Promise<BatchUpdateResult>;
    deletePermanent: (mailIds: string | string[]) => Promise<void>;
    emptyTrash: () => Promise<void>;
  };

  readonly attachments: {
    listFromMessage: (message: MailMessage) => MailAttachment[];
    download: (mailId: string, attachmentId: string) => Promise<DownloadedAttachment>;
    thumbnail: (mailId: string, attachmentId: string, options?: ThumbnailOptions) => Promise<DownloadedAttachment>;
  };

  readonly account: {
    aliases: () => Promise<AliasesResponse>;
    updateAliasDisplayName: (address: string, displayName: string) => Promise<void>;
    quota: () => Promise<JsonObject>;
    settings: () => Promise<JsonObject>;
    userData: () => Promise<JsonObject>;
    validateRecipients: (addresses: string | string[]) => Promise<JsonObject>;
  };

  private readonly email: string;
  private readonly password: string | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly sessionStore: SessionStore;
  private readonly http: MailComHttpClient;
  private session: TokenSession | null = null;
  private loginInFlight: Promise<TokenSession> | null = null;
  private refreshInFlight: { key: string; promise: Promise<TokenSession> } | null = null;
  private currentTokenBasicAuth: string;

  constructor(options: MailComClientOptions) {
    this.email = options.email;
    this.password = options.password;
    this.fetchImpl = options.fetch ?? fetch;
    this.sessionStore = options.sessionStore ?? new FileSessionStore(options.sessionDir);
    this.currentTokenBasicAuth = DEFAULT_ANDROID_OAUTH_BASIC_AUTH;
    this.http = new MailComHttpClient(
      this.fetchImpl,
      () => this.session?.accessToken,
      () => this.refreshWithLock().then(() => undefined),
    );

    this.auth = {
      login: () => this.loginWithLock(),
      refresh: (refreshToken?: string) => this.refreshWithLock(refreshToken),
      validateToken: (token?: string) => this.validateToken(token),
      logout: () => this.logout(),
    };

    this.folders = {
      list: () => this.listFolders(),
      create: (input) => this.createFolder(input),
      rename: (folderId, name) => this.renameFolder(folderId, name),
      move: (folderId, parentFolderId) => this.moveFolder(folderId, parentFolderId),
      setExpireDays: (folderId, days) => this.setFolderExpireDays(folderId, days),
      delete: (folderId) => this.deleteFolder(folderId),
    };

    this.mail = {
      search: (query, options) => this.search(query, options),
      listByFolder: (folderId, options) => this.listByFolder(folderId, options),
      listIncoming: (options) => this.listIncoming(options),
      listAll: (options) => this.listIncoming(options),
      findBySubject: (subject, options) => this.findBySubject(subject, options),
      findBySender: (sender, options) => this.findBySender(sender, options),
      syncFolder: (folderId, options) => this.syncFolder(folderId, options),
      getBody: (mailId, options) => this.getBody(mailId, options),
      getPreview: (mailIds) => this.getPreview(mailIds),
      send: (input) => this.send(input),
      reply: (input) => this.reply(input),
      forward: (input) => this.forward(input),
    };

    this.drafts = {
      list: () => this.listDrafts(),
      create: (input) => this.createDraft(input),
      update: (draftId, input) => this.updateDraft(draftId, input),
      delete: (mailIds) => this.moveToTrash(mailIds),
    };

    this.actions = {
      markRead: (mailIds) => this.batchUpdate(mailIds, { read: true }),
      markUnread: (mailIds) => this.batchUpdate(mailIds, { read: false }),
      star: (mailIds) => this.batchUpdate(mailIds, { flagged: true }),
      unstar: (mailIds) => this.batchUpdate(mailIds, { flagged: false }),
      markSpam: (mailIds) => this.markSpam(mailIds),
      markNotSpam: (mailIds) => this.markNotSpam(mailIds),
      moveToFolder: (mailIds, folderId) => this.moveToFolder(mailIds, folderId),
      moveToTrash: (mailIds) => this.moveToTrash(mailIds),
      deletePermanent: (mailIds) => this.deletePermanent(mailIds),
      emptyTrash: () => this.emptyTrash(),
    };

    this.attachments = {
      listFromMessage: (message) => message.attachments?.attachment ?? [],
      download: (mailId, attachmentId) => this.downloadAttachment(mailId, attachmentId),
      thumbnail: (mailId, attachmentId, options) => this.downloadAttachment(mailId, attachmentId, options),
    };

    this.account = {
      aliases: () => this.aliases(),
      updateAliasDisplayName: (address, displayName) => this.updateAliasDisplayName(address, displayName),
      quota: () => this.accountGet<JsonObject>("/MailAccount/accountId/Quota", MIME.quotas),
      settings: () => this.accountGet<JsonObject>("/MailAccount/accountId/Setting", MIME.settings),
      userData: () => this.userData(),
      validateRecipients: (addresses) => this.validateRecipients(addresses),
    };
  }

  async login(): Promise<TokenSession> {
    const cached = await this.sessionStore.load(this.email);
    if (cached?.accessToken && (await this.validateToken(cached.accessToken))) {
      this.session = cached;
      return cached;
    }

    if (cached?.refreshToken) {
      this.session = cached;
      try {
        return await this.refresh(cached.refreshToken);
      } catch {
        await this.sessionStore.delete(this.email);
        this.session = null;
      }
    }

    if (!this.password) {
      throw new MailComAuthError("Password is required when no valid cached session exists.");
    }

    return this.loginWithAndroidOAuth();
  }

  async refresh(refreshToken = this.session?.refreshToken, tokenBasicAuth = this.currentTokenBasicAuth): Promise<TokenSession> {
    if (!refreshToken) throw new MailComAuthError("No refresh token available.");

    const token = await this.oauthToken(
      {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: FULL_ACCESS_SCOPE,
      },
      tokenBasicAuth,
    );

    if (!token.access_token) {
      throw new MailComAuthError(token.error_description ?? token.error ?? "mail.com token refresh failed.");
    }

    const session = this.toSession(token, refreshToken);
    this.session = session;
    this.currentTokenBasicAuth = tokenBasicAuth;
    await this.sessionStore.save(this.email, session);
    return session;
  }

  async validateToken(token = this.session?.accessToken): Promise<boolean> {
    if (!token) return false;
    try {
      const response = await this.fetchImpl(`${MOBSI_BASE_URL}/UserData`, {
        method: "HEAD",
        headers: {
          ...APP_HEADERS,
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      if (this.session?.refreshToken) {
        await this.http.request<void>(`${OAUTH_BASE_URL}/token`, {
          method: "DELETE",
          responseType: "void",
          headers: {
            Accept: "*/*",
            refresh_token: this.session.refreshToken,
          },
        });
      }
    } finally {
      this.session = null;
      await this.sessionStore.delete(this.email);
    }
  }

  private async listFolders(): Promise<Folder[]> {
    await this.ensureLoggedIn();
    const data = await this.http.request<FoldersResponse>(`${this.mailboxBase()}/folders?absoluteURI=false`, {
      auth: true,
      headers: { Accept: MIME.folders },
    });
    return data.folders ?? [];
  }

  private async createFolder(input: string | CreateFolderInput): Promise<Folder> {
    await this.ensureLoggedIn();
    const payload = typeof input === "string" ? { folderName: input, folderType: "USER_DEFINED" } : {
      folderName: input.name,
      folderType: input.folderType ?? "USER_DEFINED",
    };

    return this.http.request<Folder>(`${this.mailboxBase()}/Folder?absoluteURI=false`, {
      method: "POST",
      auth: true,
      headers: {
        Accept: MIME.folder,
        "Content-Type": MIME.folderCreate,
      },
      json: payload,
    });
  }

  private renameFolder(folderId: string, name: string): Promise<Folder> {
    return this.updateFolder(folderId, { folderName: name });
  }

  private async moveFolder(folderId: string, parentFolderId: string): Promise<Folder> {
    return this.updateFolder(folderId, { parentFolderURI: folderUri(parentFolderId) });
  }

  private setFolderExpireDays(folderId: string, days: number): Promise<Folder> {
    return this.updateFolder(folderId, { expire: days });
  }

  private async updateFolder(folderId: string, patch: UpdateFolderInput): Promise<Folder> {
    await this.ensureLoggedIn();
    return this.http.request<Folder>(`${this.mailboxBase()}/Folder/${encodeURIComponent(normalizeFolderId(folderId))}?absoluteURI=false`, {
      method: "POST",
      auth: true,
      headers: {
        Accept: MIME.folder,
        "Content-Type": MIME.folderUpdate,
      },
      json: patch,
    });
  }

  private async deleteFolder(folderId: string): Promise<void> {
    await this.ensureLoggedIn();
    await this.http.request<void>(`${this.mailboxBase()}/Folder/${encodeURIComponent(normalizeFolderId(folderId))}?absoluteURI=false`, {
      method: "DELETE",
      auth: true,
      responseType: "void",
      headers: { Accept: "application/json" },
    });
  }

  private async search(query: string, options: SearchMailOptions = {}): Promise<MessagesResponse> {
    await this.ensureLoggedIn();
    const body = {
      amount: options.amount ?? 25,
      excludeFolderTypeOrId: options.excludeFolderTypeOrId ?? DEFAULT_EXCLUDED_FOLDERS,
      include: [{ conditions: [`mail.header:from,replyTo,cc,bcc,to,subject:${query}`] }],
      orderBy: options.orderBy ?? "INTERNALDATE desc",
      preferAbsoluteURIs: false,
    };

    return this.http.request<MessagesResponse>(`${this.mailboxBase()}/Mail/Query?absoluteURI=false`, {
      method: "POST",
      auth: true,
      headers: {
        Accept: MIME.messages,
        "Content-Type": MIME.mailQuery,
      },
      json: body,
    });
  }

  private async findBySubject(subject: string, options?: SearchMailOptions): Promise<MailMessage[]> {
    const response = await this.search(subject, options);
    const needle = subject.toLowerCase();
    return (response.mail ?? []).filter((message) => (message.mailHeader?.subject ?? "").toLowerCase().includes(needle));
  }

  private async findBySender(sender: string, options?: SearchMailOptions): Promise<MailMessage[]> {
    const response = await this.search(sender, options);
    const needle = sender.toLowerCase();
    return (response.mail ?? []).filter((message) => (message.mailHeader?.from ?? "").toLowerCase().includes(needle));
  }

  private async listByFolder(folderId: string, options: ListMailOptions = {}): Promise<ListMailResponse> {
    await this.ensureLoggedIn();
    const params = new URLSearchParams({ absoluteURI: "false" });
    params.set("orderBy", options.orderBy ?? "INTERNALDATE desc");
    if (options.amount !== undefined) params.set("amount", String(options.amount));
    if (options.condition) params.set("condition", options.condition);
    if (options.tagsShowAll !== undefined) params.set("tagsShowAll", String(options.tagsShowAll));

    const accept = options.format === "uris" ? MIME.uriList : MIME.messages;
    const text = await this.http.request<string>(
      `${this.mailboxBase()}/Folder/${encodeURIComponent(normalizeFolderId(folderId))}/Mail?${params}`,
      {
        auth: true,
        responseType: "text",
        headers: { Accept: accept },
      },
    );

    const trimmed = text.trim();
    if (trimmed.startsWith("{")) return JSON.parse(trimmed) as MessagesResponse;
    return { mailIds: parseUriList(text), raw: text } satisfies UriListResponse;
  }

  private async listIncoming(options: ListIncomingOptions = {}): Promise<ListIncomingResponse> {
    const excludedFolderTypeOrId = new Set(
      (options.excludeFolderTypeOrId ?? DEFAULT_EXCLUDED_FOLDERS).map((value) => value.toUpperCase()),
    );
    if (options.includeSpam === false) excludedFolderTypeOrId.add("SPAM");

    const folders = this.flattenFolders(await this.listFolders()).filter((folder) => {
      const folderType = folder.attribute?.folderType;
      const folderIdentifier = folder.folderIdentifier;
      if (!folderIdentifier || !folderType) return false;
      return !excludedFolderTypeOrId.has(folderType.toUpperCase()) && !excludedFolderTypeOrId.has(folderIdentifier.toUpperCase());
    });

    const sourceFolders = folders.flatMap((folder) => {
      const folderIdentifier = folder.folderIdentifier;
      const folderType = folder.attribute?.folderType;
      if (!folderIdentifier || !folderType) return [];
      const folderName = folder.attribute?.folderName ?? folder.attribute?.folderFullname;
      return [
        {
          folderIdentifier,
          folderType,
          ...(folderName !== undefined ? { folderName } : {}),
        },
      ];
    });

    const responses = await mapWithConcurrency(
      sourceFolders,
      LIST_INCOMING_FOLDER_CONCURRENCY,
      async (sourceFolder) => {
        const listOptions: ListMailOptions = {
          amount: options.amount ?? 25,
          tagsShowAll: options.tagsShowAll ?? true,
          format: "messages",
        };
        if (options.orderBy !== undefined) listOptions.orderBy = options.orderBy;
        if (options.condition !== undefined) listOptions.condition = options.condition;

        const response = await this.listByFolder(sourceFolder.folderIdentifier, listOptions);
        if (isUriListResponse(response)) return [];
        return (response.mail ?? []).map((mail) => ({ ...mail, sourceFolder }));
      },
    );

    const mail: IncomingMailMessage[] = responses
      .flat()
      .sort((left, right) => (right.mailHeader?.date ?? 0) - (left.mailHeader?.date ?? 0));

    return {
      mail,
      totalCount: mail.length,
      unreadCount: mail.filter((message) => message.attribute?.read === false).length,
      folders: sourceFolders,
    };
  }

  private async syncFolder(folderId: string, options: SyncFolderOptions = {}): Promise<UriListResponse> {
    const listOptions: ListMailOptions = { format: "uris" };
    if (options.orderBy !== undefined) listOptions.orderBy = options.orderBy;
    if (options.condition !== undefined) {
      listOptions.condition = options.condition;
    } else if (options.after !== undefined) {
      const timestamp = options.after instanceof Date ? options.after.getTime() : options.after;
      listOptions.condition = `mail.internaldate.after:${timestamp}`;
    }

    const response = await this.listByFolder(folderId, listOptions);
    if (!isUriListResponse(response)) {
      return {
        mailIds: (response.mail ?? []).flatMap((mail) => mail.attribute?.mailIdentifier ?? []),
        raw: "",
      };
    }
    return response;
  }

  private async getBody(mailId: string, options: { format?: "html" | "text"; markRead?: boolean } = {}): Promise<string> {
    await this.ensureLoggedIn();
    const normalizedMailId = normalizeMailId(mailId);
    const body = await this.http.request<string>(
      `${this.mailboxBase()}/Mail/${encodeURIComponent(normalizedMailId)}/Body?absoluteURI=false`,
      {
        auth: true,
        responseType: "text",
        headers: { Accept: options.format === "text" ? "text/plain" : MIME.bodyHtml },
      },
    );
    if (options.markRead !== false) await this.markReadAfterBodyFetch(normalizedMailId).catch(() => undefined);
    return body;
  }

  private async getPreview(mailIds: string | string[]): Promise<MailPreview[]> {
    await this.ensureLoggedIn();
    const form = new URLSearchParams();
    for (const mailId of this.arrayOf(mailIds)) form.append("mailIdentifier", normalizeMailId(mailId));

    const sse = await this.http.request<string>(`${this.mailboxBase()}/Mail/bodypreviews`, {
      method: "POST",
      auth: true,
      form,
      responseType: "sse",
      headers: { Accept: MIME.bodyPreviewSse },
    });

    return parseSseJsonData<MailPreview>(sse);
  }

  private async send(input: SendMailInput): Promise<MailSubmissionResult> {
    await this.ensureLoggedIn();
    const url = this.submissionUrl({ uuid: input.uuid, includeSubmissionMetadata: true });
    return this.submitMessage(url, await this.buildPayload(input));
  }

  private async reply(input: ReplyMailInput): Promise<MailSubmissionResult> {
    await this.ensureLoggedIn();
    const to = input.to ?? input.originalMail?.mailHeader?.from;
    if (!to) {
      throw new MailComValidationError("reply requires `to` or `originalMail.mailHeader.from`.");
    }

    const payload = await this.buildPayload({
      ...input,
      to,
      subject: input.subject ?? replySubject(input.originalMail?.mailHeader?.subject),
    });

    return this.submitMessage(
      this.submissionUrl({
        uuid: input.uuid,
        inReplyTo: normalizeMailId(input.originalMailId),
      }),
      payload,
    );
  }

  private async forward(input: ForwardMailInput): Promise<MailSubmissionResult> {
    await this.ensureLoggedIn();
    const payload = await this.buildPayload({
      ...input,
      subject: input.subject ?? forwardSubject(input.originalMail?.mailHeader?.subject),
    });

    return this.submitMessage(
      this.submissionUrl({
        uuid: input.uuid,
        forwardedOriginal: normalizeMailId(input.originalMailId),
      }),
      payload,
    );
  }

  private async listDrafts(): Promise<MessagesResponse> {
    const response = await this.listByFolder("DRAFTS", { format: "messages" });
    if (isUriListResponse(response)) return { mail: [], totalCount: response.mailIds.length };
    return response;
  }

  private async createDraft(input: MinimalMailMessageInput): Promise<MailMessage> {
    await this.ensureLoggedIn();
    const payload = await this.buildPayload(input);
    const response = await this.http.request<Response>(
      `${this.mailboxBase()}/Folder/DRAFTS/Mail?absoluteURI=false&MailSizeLimitExceededExceptionMapper.explicitCode=true`,
      {
        method: "POST",
        auth: true,
        responseType: "raw",
        headers: {
          Accept: "application/json",
          "Content-Type": MIME.minimalMailMessage,
        },
        json: payload,
      },
    );

    return this.draftFromWriteResponse(response, "Draft create");
  }

  private async updateDraft(draftId: string, input: MinimalMailMessageInput): Promise<MailMessage> {
    await this.ensureLoggedIn();
    const payload = await this.buildPayload(input);
    const response = await this.http.request<Response>(
      `${this.mailboxBase()}/Mail/${encodeURIComponent(normalizeMailId(draftId))}?absoluteURI=false&MailSizeLimitExceededExceptionMapper.explicitCode=true`,
      {
        method: "POST",
        auth: true,
        responseType: "raw",
        headers: {
          Accept: "application/vnd.ui.trinity.message+json",
          "Content-Type": MIME.minimalMailMessage,
        },
        json: payload,
      },
    );

    return this.draftFromWriteResponse(response, "Draft update");
  }

  private async batchUpdate(mailIds: string | string[], patch: JsonObject): Promise<BatchUpdateResult> {
    await this.ensureLoggedIn();
    return this.http.request<BatchUpdateResult>(`${this.mailboxBase()}/MailBatchUpdate`, {
      method: "POST",
      auth: true,
      headers: {
        Accept: MIME.batchUpdateResult,
        "Content-Type": MIME.batchUpdate,
      },
      json: {
        ...patch,
        mailURIs: this.arrayOf(mailIds).map(mailUri),
      },
    });
  }

  private async markReadAfterBodyFetch(mailId: string): Promise<void> {
    await this.batchUpdate(mailId, { read: true });
  }

  private moveToFolder(mailIds: string | string[], folderId: string): Promise<BatchUpdateResult> {
    return this.batchUpdate(mailIds, { folderURI: folderUri(folderId) });
  }

  private markSpam(mailIds: string | string[]): Promise<BatchUpdateResult> {
    return this.batchUpdate(mailIds, { folderType: "SPAM", flagged: false });
  }

  private markNotSpam(mailIds: string | string[]): Promise<BatchUpdateResult> {
    return this.batchUpdate(mailIds, { folderType: "INBOX", flagged: false });
  }

  private moveToTrash(mailIds: string | string[]): Promise<BatchUpdateResult> {
    return this.batchUpdate(mailIds, { folderType: "TRASH", flagged: false });
  }

  private async deletePermanent(mailIds: string | string[]): Promise<void> {
    await this.ensureLoggedIn();
    const form = new URLSearchParams();
    for (const id of this.arrayOf(mailIds)) form.append("mailURI", mailUri(id));
    form.set("moveToTrash", "false");

    await this.http.request<void>(`${this.mailboxBase()}/MailBatchDelete`, {
      method: "POST",
      auth: true,
      form,
      responseType: "void",
      headers: { Accept: "*/*" },
    });
  }

  private async emptyTrash(): Promise<void> {
    await this.ensureLoggedIn();
    await this.http.request<void>(`${this.mailboxBase()}/Folder/TRASH/Mail?absoluteURI=false&moveToTrash=false`, {
      method: "DELETE",
      auth: true,
      responseType: "void",
      headers: { Accept: "application/json" },
    });
  }

  private async downloadAttachment(
    mailId: string,
    attachmentId: string,
    thumbnail?: ThumbnailOptions,
  ): Promise<DownloadedAttachment> {
    await this.ensureLoggedIn();
    const headers: HeadersInit = {};
    if (thumbnail) {
      headers.Accept = `image/vnd.ui.trinity.thumbnail+jpg; width="${thumbnail.width ?? 100}"; height="${thumbnail.height ?? 100}";`;
    }

    const response = await this.http.request<BinaryResponse>(
      `${this.mailboxBase()}/Mail/${encodeURIComponent(normalizeMailId(mailId))}/Attachment/${encodeURIComponent(
        normalizeAttachmentId(attachmentId),
      )}`,
      {
        auth: true,
        responseType: "binary",
        headers,
      },
    );

    return {
      data: response.data,
      contentType: response.headers.get("content-type"),
      filename: filenameFromContentDisposition(response.headers.get("content-disposition")),
    };
  }

  private async aliases(): Promise<AliasesResponse> {
    return this.accountGet<AliasesResponse>(
      "/MailAccount/accountId/emailaddresses?absoluteURI=false&q.type.in=SENDER,MAIL_COLLECT&q.state.in=ACTIVE",
      MIME.mailAddresses,
    );
  }

  private async updateAliasDisplayName(address: string, displayName: string): Promise<void> {
    await this.ensureLoggedIn();
    const aliases = await this.aliases();
    const alias = aliases.mailaddresslist?.find((item) => item.address.toLowerCase() === address.toLowerCase());
    if (!alias) throw new MailComValidationError(`Alias not found: ${address}`);

    await this.http.request<void>(
      `${HSP2_BASE_URL}/massrv/MailAccount/accountId/EmailAddress/${encodeMailAddressPath(alias.address)}`,
      {
        method: "PUT",
        auth: true,
        responseType: "void",
        headers: { "Content-Type": MIME.minimalMailAddress },
        json: {
          displayName,
          type: alias.type,
          entryDate: alias.entryDate,
          address: alias.address,
          defaultSenderAddress: alias.defaultSenderAddress,
          defaultReceiverAddress: alias.defaultReceiverAddress,
          pgpEnabled: alias.pgpEnabled,
          deletable: alias.deletable,
        },
      },
    );
  }

  private async accountGet<T>(path: string, accept: string): Promise<T> {
    await this.ensureLoggedIn();
    return this.http.request<T>(`${HSP2_BASE_URL}/massrv${path}`, {
      auth: true,
      headers: { Accept: accept },
    });
  }

  private async userData(): Promise<JsonObject> {
    await this.ensureLoggedIn();
    return this.http.request<JsonObject>(`${MOBSI_BASE_URL}/UserData`, {
      auth: true,
      headers: { Accept: "application/json" },
    });
  }

  private async validateRecipients(addresses: string | string[]): Promise<JsonObject> {
    await this.ensureLoggedIn();
    return this.http.request<JsonObject>(`${HSP2_BASE_URL}/massrv/MailAccount/emailaddressvalidations`, {
      method: "POST",
      auth: true,
      headers: {
        Accept: MIME.validationResponse,
        "Content-Type": MIME.validationRequest,
      },
      json: this.arrayOf(addresses),
    });
  }

  private async submitMessage(url: string, payload: MinimalMailPayload): Promise<MailSubmissionResult> {
    const sse = await this.http.request<string>(url, {
      method: "POST",
      auth: true,
      responseType: "sse",
      headers: {
        Accept: MIME.eventStream,
        "Content-Type": MIME.minimalMailMessage,
      },
      json: payload,
    });
    return parseMailSubmissionResult(sse);
  }

  private async buildPayload(input: MinimalMailMessageInput): Promise<MinimalMailPayload> {
    const attachments = input.attachments ?? [];
    validateAttachments(attachments);
    const from = input.from ?? (await this.defaultSender());

    return {
      mailHeader: {
        from,
        to: this.arrayOf(input.to),
        cc: this.arrayOf(input.cc),
        bcc: this.arrayOf(input.bcc),
        subject: input.subject ?? "",
        date: input.date ?? Date.now(),
        priority: input.priority ?? "3",
        ...(input.dispositionNotificationTo
          ? { dispositionNotificationTo: this.arrayOf(input.dispositionNotificationTo) }
          : {}),
      },
      htmlBody: input.htmlBody,
      attachments: attachments.map(encodeAttachment),
    };
  }

  private async draftFromWriteResponse(response: Response, label: string): Promise<MailMessage> {
    const responseText = await response.text();
    if (responseText.trim()) return JSON.parse(responseText) as MailMessage;

    const location = response.headers.get("location");
    if (!location) {
      throw new MailComError(`${label} succeeded but mail.com returned no body and no Location header.`);
    }

    return this.findDraftById(normalizeMailId(location), label);
  }

  private async findDraftById(draftId: string, label: string): Promise<MailMessage> {
    const drafts = await this.listDrafts();
    const match = drafts.mail?.find((mail) => mailMatchesId(mail, draftId));

    if (!match) {
      throw new MailComError(`${label} succeeded but draft ${draftId} could not be found after refetch.`);
    }

    return match;
  }

  private async defaultSender(): Promise<string> {
    const aliases = await this.aliases().catch(() => null);
    const sender = aliases?.mailaddresslist?.find((alias) => alias.defaultSenderAddress) ?? aliases?.mailaddresslist?.[0];
    if (!sender?.address) return this.email;
    return sender.displayName ? `${sender.displayName} <${sender.address}>` : sender.address;
  }

  private flattenFolders(folders: Folder[]): Folder[] {
    return folders.flatMap((folder) => [folder, ...this.flattenFolders(folder.folders ?? [])]);
  }

  private async ensureLoggedIn(): Promise<void> {
    if (this.session?.accessToken) return;
    await this.loginWithLock();
  }

  private async loginWithLock(): Promise<TokenSession> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.login().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  private async refreshWithLock(
    refreshToken = this.session?.refreshToken,
    tokenBasicAuth = this.currentTokenBasicAuth,
  ): Promise<TokenSession> {
    const key = `${tokenBasicAuth}\0${refreshToken ?? ""}`;
    if (!this.refreshInFlight || this.refreshInFlight.key !== key) {
      const promise = this.refresh(refreshToken, tokenBasicAuth).finally(() => {
        if (this.refreshInFlight?.key === key) {
          this.refreshInFlight = null;
        }
      });
      this.refreshInFlight = { key, promise };
    }
    return this.refreshInFlight.promise;
  }

  private async loginWithAndroidOAuth(): Promise<TokenSession> {
    if (!this.password) {
      throw new MailComAuthError("Password is required for Android OAuth login.");
    }

    const verifier = base64Url(randomBytes(48));
    const challenge = base64Url(createHash("sha256").update(verifier).digest());
    const state = base64Url(randomBytes(48));
    const cookies = new CookieJar();

    const authorizeUrl = new URL(`${OAUTH_BASE_URL}/authorize`);
    authorizeUrl.search = new URLSearchParams({
      client_id: ANDROID_CLIENT_ID,
      redirect_uri: ANDROID_REDIRECT_URI,
      response_type: "code",
      state,
      code_challenge: challenge,
      login_hint: this.email,
      code_challenge_method: "S256",
    }).toString();

    const authorize = await this.webviewRequest(authorizeUrl, cookies);
    const loginAppUrl = this.requiredLocation(authorize, "authorize redirect");
    const authcodeContext = new URL(loginAppUrl).searchParams.get("authcode-context");
    if (!authcodeContext) throw new MailComAuthError("Android OAuth login did not return authcode-context.");

    await this.webviewRequest(loginAppUrl, cookies);

    const loginFailedUrl = new URL("https://auth.mail.com/loginapp/oauth2");
    loginFailedUrl.searchParams.set("status", "login_failed");
    loginFailedUrl.searchParams.set("login_hint", this.email);
    loginFailedUrl.searchParams.set("authcode-context", authcodeContext);

    const loginForm = new URLSearchParams({
      password: this.password,
      service: "oauth2",
      successURL: `${OAUTH_BASE_URL}/authcode?authcode-context=${authcodeContext}`,
      loginFailedURL: loginFailedUrl.toString(),
      loginErrorURL: "https://auth.mail.com/login/error",
      statistics: "",
      username: this.email,
    });

    const login = await this.webviewRequest("https://login.mail.com/login", cookies, {
      method: "POST",
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: "https://auth.mail.com",
        Referer: loginAppUrl,
      },
      body: loginForm,
    });

    const authcodeUrl = this.requiredLocation(login, "login redirect");
    const authcode = await this.webviewRequest(authcodeUrl, cookies);
    const appRedirect = this.requiredLocation(authcode, "authcode redirect");
    const redirectUrl = new URL(appRedirect);
    const code = redirectUrl.searchParams.get("code");
    const returnedState = redirectUrl.searchParams.get("state");
    if (!code) throw new MailComAuthError("Android OAuth login did not return authorization code.");
    if (returnedState !== state) throw new MailComAuthError("Android OAuth state mismatch.");

    const token = await this.oauthToken(
      {
        grant_type: "authorization_code",
        code,
        redirect_uri: ANDROID_REDIRECT_URI,
        client_id: ANDROID_CLIENT_ID,
        code_verifier: verifier,
      },
      DEFAULT_ANDROID_OAUTH_BASIC_AUTH,
    );

    if (!token.access_token || !token.refresh_token) {
      throw new MailComAuthError(token.error_description ?? token.error ?? "mail.com Android OAuth token exchange failed.");
    }

    this.currentTokenBasicAuth = DEFAULT_ANDROID_OAUTH_BASIC_AUTH;
    this.session = this.toSession(token);
    return this.refresh(token.refresh_token, DEFAULT_ANDROID_OAUTH_BASIC_AUTH);
  }

  private async webviewRequest(
    url: string | URL,
    cookies: CookieJar,
    init: RequestInit = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", WEBVIEW_USER_AGENT);
    headers.set("Accept-Language", "en-IN,en-GB;q=0.9,en;q=0.8");
    const cookieHeader = cookies.header();
    if (cookieHeader) headers.set("Cookie", cookieHeader);

    const response = await this.fetchImpl(url, {
      ...init,
      headers,
      redirect: "manual",
    });
    cookies.absorb(response.headers);
    return response;
  }

  private requiredLocation(response: Response, label: string): string {
    const location = response.headers.get("location");
    if (!location) throw new MailComAuthError(`Android OAuth ${label} did not include Location header.`);
    return location;
  }

  private async oauthToken(formInput: Record<string, string>, authorization = this.currentTokenBasicAuth): Promise<OAuthTokenResponse> {
    const form = new URLSearchParams(formInput);
    const response = await this.fetchImpl(`${OAUTH_BASE_URL}/token`, {
      method: "POST",
      headers: {
        ...APP_HEADERS,
        Accept: "*/*",
        Authorization: authorization,
        "Content-Type": 'application/x-www-form-urlencoded;charset="UTF-8"',
      },
      body: form,
    });

    const json = (await response.json().catch(() => ({}))) as OAuthTokenResponse;
    if (!response.ok) {
      throw new MailComAuthError(json.error_description ?? json.error ?? `OAuth token request failed with ${response.status}`);
    }
    return json;
  }

  private toSession(token: OAuthTokenResponse, retainedRefreshToken?: string): TokenSession {
    if (!token.access_token) throw new MailComAuthError("OAuth response did not include access_token.");
    const now = Date.now();
    return {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? retainedRefreshToken ?? this.session?.refreshToken ?? "",
      createdAt: this.session?.createdAt ?? now,
      updatedAt: now,
      ...(token.expires_in ? { expiresAt: now + token.expires_in * 1000 } : {}),
    };
  }

  private submissionUrl(
    input: {
      uuid?: string | undefined;
      inReplyTo?: string | undefined;
      forwardedOriginal?: string | undefined;
      includeSubmissionMetadata?: boolean | undefined;
    } = {},
  ): string {
    const params = new URLSearchParams();
    if (input.inReplyTo) params.set("@SUBMISSION-TRANSIENT-IN-REPLY-TO", input.inReplyTo);
    if (input.forwardedOriginal) params.set("@SUBMISSION-TRANSIENT-FORWARDED-ORIGINAL", input.forwardedOriginal);
    if (input.includeSubmissionMetadata || input.uuid || input.inReplyTo || input.forwardedOriginal) {
      params.set("@SUBMISSION-TRANSIENT-UUID", input.uuid ?? crypto.randomUUID());
      params.set("MailSizeLimitExceededExceptionMapper.explicitCode", "true");
    }

    const query = params.toString();
    return `${this.mailboxBase()}/Mailsubmission${query ? `?${query}` : ""}`;
  }

  private mailboxBase(): string {
    return `${HSP2_BASE_URL}/msgsrv/Mailbox/primaryMailbox`;
  }

  private arrayOf(value: AddressList | undefined): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }
}

function mailMatchesId(mail: MailMessage, mailId: string): boolean {
  const candidate = mail.attribute?.mailIdentifier ?? mail.mailURI;
  return typeof candidate === "string" && normalizeMailId(candidate) === mailId;
}

async function mapWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = [];
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex] as T, currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function encodeAttachment(input: MailAttachmentInput): { contentType: string; filename: string; base64data: string } {
  validateAttachmentData(input);

  return {
    contentType: input.contentType,
    filename: input.filename,
    base64data: input.base64data ?? (input.data === undefined ? "" : toBase64(input.data)),
  };
}

function replySubject(subject: string | undefined): string {
  const trimmed = subject?.trim();
  if (!trimmed) return "Re:";
  return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function forwardSubject(subject: string | undefined): string {
  const trimmed = subject?.trim();
  if (!trimmed) return "Fwd:";
  return /^fwd?:/i.test(trimmed) ? trimmed : `Fwd: ${trimmed}`;
}

function validateAttachments(attachments: MailAttachmentInput[]): void {
  for (const attachment of attachments) validateAttachmentData(attachment);
  validateAttachmentSize(attachments);
}

function validateAttachmentData(attachment: MailAttachmentInput): void {
  if (attachment.data === undefined && attachment.base64data === undefined) {
    throw new MailComValidationError(`Attachment "${attachment.filename}" requires data or base64data.`);
  }
  if (attachment.data !== undefined && attachment.base64data !== undefined) {
    throw new MailComValidationError(`Attachment "${attachment.filename}" must not include both data and base64data.`);
  }
}

function validateAttachmentSize(attachments: MailAttachmentInput[]): void {
  const totalBytes = attachments.reduce((total, attachment) => total + attachmentByteLength(attachment), 0);
  if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new MailComValidationError(
      `Attachments exceed the 25 MB limit (${totalBytes} bytes > ${MAX_TOTAL_ATTACHMENT_BYTES} bytes).`,
    );
  }
}

function attachmentByteLength(attachment: MailAttachmentInput): number {
  if (attachment.data !== undefined) return dataByteLength(attachment.data);
  if (attachment.base64data !== undefined) return base64ByteLength(attachment.base64data);
  return 0;
}

function dataByteLength(data: string | ArrayBuffer | ArrayBufferView): number {
  if (typeof data === "string") return Buffer.byteLength(data, "utf8");
  if (data instanceof ArrayBuffer) return data.byteLength;
  return data.byteLength;
}

function base64ByteLength(base64data: string): number {
  const normalized = base64data.replace(/\s/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function encodeMailAddressPath(address: string): string {
  return encodeURIComponent(address).replace(/%40/gi, "@");
}

function toBase64(data: string | ArrayBuffer | ArrayBufferView): string {
  if (typeof data === "string") return Buffer.from(data, "utf8").toString("base64");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("base64");
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
}

function filenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8 = value.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) return decodeURIComponent(utf8);
  const quoted = value.match(/filename="([^"]+)"/i)?.[1];
  if (quoted) return quoted;
  return value.match(/filename=([^;]+)/i)?.[1] ?? null;
}

function isUriListResponse(response: ListMailResponse): response is UriListResponse {
  return Array.isArray((response as UriListResponse).mailIds);
}

function base64Url(data: Buffer): string {
  return data.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

class CookieJar {
  private readonly values = new Map<string, string>();

  header(): string {
    return [...this.values.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  }

  absorb(headers: Headers): void {
    for (const cookie of getSetCookies(headers)) {
      const [pair] = cookie.split(";");
      if (!pair) continue;
      const index = pair.indexOf("=");
      if (index <= 0) continue;
      this.values.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }
}

function getSetCookies(headers: Headers): string[] {
  const withNodeHelper = headers as Headers & { getSetCookie?: () => string[] };
  const cookies = withNodeHelper.getSetCookie?.();
  if (cookies?.length) return cookies;
  const combined = headers.get("set-cookie");
  return combined ? [combined] : [];
}

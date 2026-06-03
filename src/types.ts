export type FetchLike = typeof fetch;
export type JsonObject = Record<string, unknown>;
export type AddressList = string | string[];

export interface TokenSession {
  accessToken: string;
  refreshToken: string;
  accountEmail?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface SessionStore {
  load(email: string): Promise<TokenSession | null>;
  save(email: string, session: TokenSession): Promise<void>;
  delete(email: string): Promise<void>;
}

export interface MailComClientOptions {
  email: string;
  password?: string;
  sessionStore?: SessionStore;
  fetch?: FetchLike;
  sessionDir?: string;
}

export interface OAuthTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

export interface MailAttachmentInput {
  contentType: string;
  filename: string;
  base64data?: string;
  data?: string | ArrayBuffer | ArrayBufferView;
}

export interface MinimalMailMessageInput {
  from?: string;
  to: AddressList;
  cc?: AddressList;
  bcc?: AddressList;
  subject?: string;
  htmlBody: string;
  attachments?: MailAttachmentInput[];
  priority?: string;
  date?: number;
  dispositionNotificationTo?: AddressList;
}

export interface SendMailInput extends MinimalMailMessageInput {
  uuid?: string;
}

export interface ReplyMailInput {
  originalMailId: string;
  htmlBody: string;
  to?: AddressList;
  from?: string;
  cc?: AddressList;
  bcc?: AddressList;
  subject?: string;
  attachments?: MailAttachmentInput[];
  priority?: string;
  date?: number;
  uuid?: string;
  originalMail?: MailMessage;
}

export interface ForwardMailInput extends MinimalMailMessageInput {
  originalMailId: string;
  uuid?: string;
  originalMail?: MailMessage;
}

export interface MailSubmissionResult {
  messageId: string;
  rawLocation: string;
}

export interface MailHeader {
  messageType?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  date?: number;
  priority?: string;
  sensitivity?: string;
  dispositionNotificationTo?: string[];
  [key: string]: unknown;
}

export interface MailAttachment {
  attachmentURI: string;
  temporaryURIfactoryURI?: string;
  contentType?: string;
  contentId?: string;
  filename?: string;
  estimatedSize?: number;
  malwareState?: string;
  inline?: boolean;
  vcard?: boolean;
  calendar?: boolean;
  thumbnail?: boolean;
  contentHash?: string;
  [key: string]: unknown;
}

export interface MailMessage {
  mailURI: string;
  removalUri?: string;
  attribute?: JsonObject & {
    mailIdentifier?: string;
    folderIdentifier?: string;
    folderType?: string;
    read?: boolean;
    flagged?: boolean;
    hasDownloadableAttachments?: boolean;
  };
  mailHeader?: MailHeader;
  mailBodyURI?: string;
  attachments?: {
    attachmentsURI?: string;
    attachment?: MailAttachment[];
  };
  security?: JsonObject;
  [key: string]: unknown;
}

export interface Folder {
  folderIdentifier?: string;
  quota?: JsonObject;
  attribute?: JsonObject & {
    folderName?: string;
    folderFullname?: string;
    folderType?: string;
    systemFolder?: boolean;
  };
  folders?: Folder[];
  _links?: JsonObject;
  [key: string]: unknown;
}

export interface FoldersResponse {
  folders: Folder[];
  [key: string]: unknown;
}

export interface CreateFolderInput {
  name: string;
  folderType?: string;
}

export interface UpdateFolderInput {
  folderName?: string;
  parentFolderURI?: string;
  expire?: number;
}

export interface MessagesResponse {
  mailsURI?: string;
  mail?: MailMessage[];
  totalCount?: number;
  unreadCount?: number;
  [key: string]: unknown;
}

export interface UriListResponse {
  mailIds: string[];
  raw: string;
}

export type ListMailResponse = MessagesResponse | UriListResponse;

export interface ListMailOptions {
  amount?: number;
  orderBy?: string;
  condition?: string;
  tagsShowAll?: boolean;
  format?: "messages" | "uris";
}

export interface IncomingMailSourceFolder {
  folderIdentifier: string;
  folderType: string;
  folderName?: string;
}

export interface IncomingMailMessage extends MailMessage {
  sourceFolder: IncomingMailSourceFolder;
}

export interface ListIncomingOptions {
  amount?: number;
  orderBy?: string;
  condition?: string;
  tagsShowAll?: boolean;
  excludeFolderTypeOrId?: readonly string[];
  includeSpam?: boolean;
}

export interface ListIncomingResponse {
  mail: IncomingMailMessage[];
  totalCount: number;
  unreadCount: number;
  folders: IncomingMailSourceFolder[];
}

export interface SyncFolderOptions {
  after?: number | Date;
  condition?: string;
  orderBy?: string;
}

export interface SearchMailOptions {
  amount?: number;
  excludeFolderTypeOrId?: readonly string[];
  orderBy?: string;
}

export interface MailPreview {
  mailIdentifier: string;
  preview: string;
  [key: string]: unknown;
}

export interface BatchUpdateResult {
  [mailId: string]: {
    status: number;
    detail?: string;
    [key: string]: unknown;
  };
}

export interface DownloadedAttachment {
  data: ArrayBuffer;
  contentType: string | null;
  filename: string | null;
}

export interface ThumbnailOptions {
  width?: number;
  height?: number;
}

export interface Alias {
  type?: string;
  entryDate?: string;
  address: string;
  displayName?: string;
  defaultSenderAddress?: boolean;
  defaultReceiverAddress?: boolean;
  state?: string;
  deletable?: boolean;
  pgpEnabled?: boolean;
  [key: string]: unknown;
}

export interface AliasesResponse {
  mailaddresslist?: Alias[];
  [key: string]: unknown;
}

export const OAUTH_BASE_URL = "https://oauth2.mail.com";
export const MOBSI_BASE_URL = "https://mobsi.mail.com/rest/MobSI";
export const HSP2_BASE_URL = "https://hsp2.mail.com/service";

export const APP_USER_AGENT =
  "mailcom.android.androidmail/9.8.0 Dalvik/2.1.0 (Linux; U; Android 13; SM-S908E Build/TQ2B.230505.005.A1)";

export const WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 13; SM-S908E Build/TQ2B.230505.005.A1; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Mobile Safari/537.36 [APPNME/mailcom.android.androidmail;APPVS/9.8.0;APPTNME/andall]";

export const APP_HEADERS = {
  "Accept-Charset": "utf-8",
  "Accept-Language": "en-IN,en-GB;q=0.9,en;q=0.8",
  "User-Agent": APP_USER_AGENT,
  "X-Ui-App": "mailcom.android.androidmail/9.8.0",
} as const;

export const ANDROID_CLIENT_ID = "mailcom_mailapp_android";
export const ANDROID_REDIRECT_URI = "com.mail.androidmail.redirect://authorization_code_grant";

export const DEFAULT_ANDROID_OAUTH_BASIC_AUTH =
  "Basic bWFpbGNvbV9tYWlsYXBwX2FuZHJvaWQ6a2luMmxTU2tVUXRRQ0NsWG9YZklOaEp1bUc2SmQwM0taNVdMN05KOQ==";

export const FULL_ACCESS_SCOPE =
  "mailbox_user_full_access mailbox_user_status_access hsp_user_full_access onlinestorage_user_meta_read onlinestorage_user_meta_write foo bar";

export const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export const MIME = {
  folder: "application/vnd.ui.trinity.folder-v2+json",
  folderCreate: "application/vnd.ui.trinity.folder.create+json; charset=utf-8",
  folderUpdate: "application/vnd.ui.trinity.folder.update+json",
  folders: "application/vnd.ui.trinity.folders-v5+json",
  mailAddresses: "application/vnd.ui.trinity.mailaddress.list-v5+json",
  messages: "application/vnd.ui.trinity.messages+json",
  mailQuery: "application/vnd.ui.trinity.mailquery+json",
  minimalMailMessage: "application/vnd.ui.trinity.minimalmailmessage+json",
  minimalMailAddress: "application/vnd.ui.trinity.minimalmailaddress-v3+json",
  batchUpdate: "application/vnd.ui.trinity.message.batchupdate-v2+json",
  batchUpdateResult: "application/vnd.ui.trinity.message.batchupdate.result-v2+json",
  validationRequest: "application/vnd.ui.trinity.email-address-validation-request+json",
  validationResponse: "application/vnd.ui.trinity.email-address-validation-response+json",
  settings: "application/vnd.ui.trinity.settings-v2+json",
  quotas: "application/vnd.ui.trinity.quotas+json",
  bodyHtml: "text/vnd.ui.insecure+html; removeCharsetMetaInfo=true",
  bodyPreviewSse: "text/event-stream; length=300; builder=html",
  eventStream: "text/event-stream",
  uriList: "text/uri-list",
} as const;

import assert from "node:assert/strict";
import test from "node:test";
import { MailComWebAliasAddon } from "../src/web-aliases.js";

type RecordedRequest = {
  url: string;
  method: string;
  headers: Headers;
  body: string;
};

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html;charset=UTF-8", ...Object.fromEntries(new Headers(init.headers)) },
  });
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

function redirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location } });
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

function aliasPage(includeAlias: boolean): string {
  const aliasRow = includeAlias
    ? `<div class="table_body-row table_row" data-row-id="alias-row"><div>sdkalias@mail.com</div></div>`
    : "";
  return `
    <form id="create-form">
      <input name="fieldSet:fieldSet_body:grid:addressSelection:localPart" />
      <select name="fieldSet:fieldSet_body:grid:addressSelection:domainSelection">
        <option value="option-mail">mail.com</option>
        <option value="option-other">email.com</option>
      </select>
    </form>
    <div class="table_body">
      <div class="table_body-row table_row is-first" data-row-id="primary-row">
        <div><strong>user@mail.com</strong> (Default sender address)</div>
      </div>
      ${aliasRow}
    </div>
    <div class="js-template is-hidden">${"x".repeat(2200)}</div>
    <script>
      Wicket.Ajax.ajax({"u":"./allEmailAddresses;jsessionid=JID?3-1.0-addresses-hoverTemplate-hoverIconPanel-hoverIcons-1-hoverIcon","c":"editBtn","e":"click"});
      Wicket.Ajax.ajax({"u":"./allEmailAddresses;jsessionid=JID?3-1.0-addresses-hoverTemplate-hoverIconPanel-hoverIcons-2-hoverIcon","c":"deleteBtn","e":"click"});
      Wicket.Ajax.ajax({"u":"./allEmailAddresses;jsessionid=JID?3-1.0-internalAliasChapter-internalAliasPanel-form-fieldSet-fieldSet_body-grid-button-button","m":"POST","c":"createBtn","f":"create-form","e":"click"});
    </script>
  `;
}

function defaultDialog(): string {
  return `
    <form id="default-form">
      <ul>
        <li>
          <input type="radio" name="defaultSenderRadioGroup:radioGroup" value="radioEmail" checked="checked" />
          <label>sdkalias@mail.com</label>
        </li>
        <li>
          <input type="radio" name="defaultSenderRadioGroup:radioGroup" value="radioName" />
          <label>&quot;SDK Probe&quot; &lt;sdkalias@mail.com&gt;</label>
        </li>
      </ul>
      <button name="buttonContainer:container:buttonContainer_body:ok">OK</button>
    </form>
    <script>
      Wicket.Ajax.ajax({"u":"./allEmailAddresses;jsessionid=JID?3-1.0-topLevelContainer-flyoutTopLevel-content-form-buttonContainer-container-buttonContainer_body-ok","m":"POST","c":"okBtn","e":"click"});
    </script>
  `;
}

function deleteDialog(): string {
  return `
    <div class="dialog-container">Should this address be deleted?</div>
    <script>
      Wicket.Ajax.ajax({"u":"./allEmailAddresses;jsessionid=JID?3-1.0-topLevelContainer-dialog-root~container-container-menu-buttonContainer-primary","c":"confirmBtn","e":"click"});
    </script>
  `;
}

function webLoginResponses(): Response[] {
  return [
    redirect("https://mlogin.mail.com/oauth2/?client_id=mailcom_mailcheck_chrome&state=state&authcode-context=ctx&login_hint=user%40mail.com"),
    htmlResponse(`<input name="service" value="oauth2" />`),
    redirect("https://oauth2.mail.com/authcode?authcode-context=ctx&ott=ott"),
    redirect("https://lpebgcnlaohcgdfhbffjajlnpifdkllg.chromiumapp.org/?code=auth-code&state=state"),
    jsonResponse({ access_token: "web-access" }),
    redirect("https://navigator-lxa.mail.com/login?partnerdata=data&origin=toolbar&ott=ott"),
    htmlResponse("<html>navigator login</html>"),
    redirect("https://navigator-lxa.mail.com/?sid=nav-sid"),
    htmlResponse("<html>navigator root</html>"),
    redirect(
      "https://3c-lxa.mail.com/mail/client/settings/?navsid=nav-sid&iac_appname=mail_settings&iac_token=token&ott=ott",
    ),
    redirect(
      "https://3c-lxa.mail.com/mail/client/settings/signature/;jsessionid=JID?navsid=nav-sid&iac_appname=mail_settings&iac_token=token",
    ),
    htmlResponse("<html>signature</html>"),
    htmlResponse(aliasPage(false)),
  ];
}

test("web alias addon creates, selects default sender variants, and deletes aliases", async () => {
  const { fetch, requests } = mockFetch([
    ...webLoginResponses(),
    htmlResponse(aliasPage(true)),
    htmlResponse(defaultDialog()),
    htmlResponse(defaultDialog()),
    htmlResponse(aliasPage(true)),
    htmlResponse(defaultDialog()),
    htmlResponse(aliasPage(true)),
    htmlResponse(deleteDialog()),
    htmlResponse(aliasPage(false)),
  ]);

  const addon = new MailComWebAliasAddon({
    email: "user@mail.com",
    password: "password",
    fetch,
  });

  assert.deepEqual(await addon.createAlias("sdkalias@mail.com"), { address: "sdkalias@mail.com" });
  assert.deepEqual(await addon.defaultSenderOptions("sdkalias@mail.com"), [
    { value: "radioEmail", label: "sdkalias@mail.com", sender: "email", selected: true },
    { value: "radioName", label: '"SDK Probe" <sdkalias@mail.com>', sender: "name-email", selected: false },
  ]);
  await addon.setDefaultAlias("sdkalias@mail.com", { sender: "name-email" });
  await addon.setDefaultAlias("sdkalias@mail.com", { sender: "email" });
  await addon.deleteAlias("sdkalias@mail.com");

  const createRequest = requests.find((request) =>
    request.body.includes("fieldSet%3AfieldSet_body%3Agrid%3AaddressSelection%3AlocalPart=sdkalias"),
  );
  assert.ok(createRequest);
  assert.equal(createRequest.method, "POST");
  assert.equal(
    createRequest.body,
    "fieldSet%3AfieldSet_body%3Agrid%3AaddressSelection%3AlocalPart=sdkalias&fieldSet%3AfieldSet_body%3Agrid%3AaddressSelection%3AdomainSelection=option-mail&fieldSet%3AfieldSet_body%3Agrid%3Abutton%3Abutton=1",
  );

  const defaultPosts = requests.filter((request) => request.url.includes("buttonContainer_body-ok"));
  assert.equal(defaultPosts.length, 2);
  assert.match(defaultPosts[0]?.body ?? "", /defaultSenderRadioGroup%3AradioGroup=radioName/);
  assert.match(defaultPosts[1]?.body ?? "", /defaultSenderRadioGroup%3AradioGroup=radioEmail/);

  const deleteOpen = requests.find((request) => request.url.includes("hoverIcons-2-hoverIcon"));
  assert.ok(deleteOpen?.url.includes("rowId=alias-row"));
});

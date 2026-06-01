import assert from "node:assert/strict";
import test from "node:test";
import { folderUri, mailUri, normalizeAttachmentId, normalizeFolderId, normalizeMailId, parseUriList } from "../src/index.js";

test("normalizes mail ids from plain ids and trinity URIs", () => {
  assert.equal(normalizeMailId("1779827702348204390"), "1779827702348204390");
  assert.equal(normalizeMailId("../../Mail/1779827702348204390"), "1779827702348204390");
  assert.equal(mailUri("1779827702348204390"), "../../Mail/1779827702348204390");
});

test("normalizes attachment and folder ids", () => {
  assert.equal(normalizeAttachmentId("../../Mail/1/Attachment/MF8x"), "MF8x");
  assert.equal(normalizeFolderId("/Folder/1779585431329104530"), "1779585431329104530");
  assert.equal(folderUri("1779585431329104530"), "/Folder/1779585431329104530");
});

test("parses text/uri-list folder responses", () => {
  assert.deepEqual(parseUriList("../../Mail/1\r\n../../Mail/2\r\n"), ["1", "2"]);
});

test("parseUriList ignores RFC 2483 comment lines", () => {
  assert.deepEqual(parseUriList("# 2 records\r\n../../Mail/1\r\n../../Mail/2\r\n"), ["1", "2"]);
});

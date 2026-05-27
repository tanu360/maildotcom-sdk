import assert from "node:assert/strict";
import test from "node:test";
import { parseMailSubmissionResult, parseSse, parseSseJsonData } from "../src/index.js";

test("parseSse parses multi-line server-sent events", () => {
  const events = parseSse("id: 1\nevent: success\ndata: hello\ndata: world\n\n: noop\n\n");
  assert.deepEqual(events, [{ id: "1", event: "success", data: "hello\nworld" }]);
});

test("parseMailSubmissionResult extracts decoded message id", () => {
  const result = parseMailSubmissionResult(
    "id: 1\nevent: success\ndata: ../uas/Mailsubmission/-1/%3Ctrinity-id%40host%3E\n\n",
  );
  assert.equal(result.rawLocation, "../uas/Mailsubmission/-1/%3Ctrinity-id%40host%3E");
  assert.equal(result.messageId, "<trinity-id@host>");
});

test("parseSseJsonData returns JSON data events", () => {
  const previews = parseSseJsonData<{ mailIdentifier: string }>(
    'id: 1\nevent: success\ndata: {"mailIdentifier":"123"}\n\n: noop\n\n',
  );
  assert.deepEqual(previews, [{ mailIdentifier: "123" }]);
});


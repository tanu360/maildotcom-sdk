export interface ServerSentEvent {
  id?: string;
  event?: string;
  data: string;
}

export function parseSse(text: string): ServerSentEvent[] {
  const events: ServerSentEvent[] = [];
  const chunks = text.replace(/\r\n/g, "\n").split(/\n\n+/);

  for (const chunk of chunks) {
    const lines = chunk.split("\n").filter(Boolean);
    if (lines.length === 0) continue;

    let id: string | undefined;
    let event: string | undefined;
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith(":")) continue;
      const separator = line.indexOf(":");
      const field = separator === -1 ? line : line.slice(0, separator);
      const rawValue = separator === -1 ? "" : line.slice(separator + 1);
      const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;

      if (field === "id") id = value;
      if (field === "event") event = value;
      if (field === "data") dataLines.push(value);
    }

    if (id || event || dataLines.length > 0) {
      const parsed: ServerSentEvent = { data: dataLines.join("\n") };
      if (id !== undefined) parsed.id = id;
      if (event !== undefined) parsed.event = event;
      events.push(parsed);
    }
  }

  return events;
}

export function parseSseJsonData<T>(text: string): T[] {
  return parseSse(text)
    .filter((event) => event.data.trim().startsWith("{") || event.data.trim().startsWith("["))
    .map((event) => JSON.parse(event.data) as T);
}

export function parseMailSubmissionResult(text: string): { messageId: string; rawLocation: string } {
  const success = parseSse(text).find((event) => event.event === "success" && event.data);
  if (!success) {
    throw new Error("mail.com submission did not return a success event");
  }

  const rawLocation = success.data.trim();
  const encodedMessageId = rawLocation.split("/").filter(Boolean).at(-1) ?? rawLocation;
  return {
    rawLocation,
    messageId: safeDecode(encodedMessageId),
  };
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type SSEEvent = {
  event?: string;
  data: string;
  id?: string;
};

const parseFrame = (frame: string): SSEEvent | null => {
  const lines = frame.split(/\r?\n/);
  const dataLines: string[] = [];
  let event: string | undefined;
  let id: string | undefined;

  for (const rawLine of lines) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const idx = rawLine.indexOf(":");
    const field = idx === -1 ? rawLine : rawLine.slice(0, idx);
    let value = idx === -1 ? "" : rawLine.slice(idx + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
    else if (field === "id") id = value;
  }

  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n"), id };
};

export const parseSSE = async function* (reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const normalized = buffer.replace(/\r\n/g, "\n");
    const frames = normalized.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) yield parsed;
    }
  }

  const finalFrame = buffer.replace(/\r\n/g, "\n");
  const parsed = parseFrame(finalFrame);
  if (parsed) yield parsed;
};

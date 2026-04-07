export async function* parseNDJSON<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<T> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as T;
      } catch (error) {
        console.warn("Ignoring malformed NDJSON record", error, trimmed);
      }
    }
  }

  const trimmed = buffer.trim();
  if (trimmed) {
    try {
      yield JSON.parse(trimmed) as T;
    } catch (error) {
      console.warn("Ignoring trailing malformed NDJSON record", error, trimmed);
    }
  }
}

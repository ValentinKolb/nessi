export const parseNDJSON = async function* <T>(
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
      } catch {
        // silently skip malformed records
      }
    }
  }

  const trimmed = buffer.trim();
  if (trimmed) {
    try {
      yield JSON.parse(trimmed) as T;
    } catch {
      // silently skip trailing malformed records
    }
  }
};

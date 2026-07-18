const COMPRESSED_MARKER = "__dialektikCompressed";
const COMPRESSION_THRESHOLD = 1024;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** Compresses larger application packets when the WebView supports gzip. */
export async function encodeMessage<T>(message: T): Promise<T | Record<string, unknown>> {
  const json = JSON.stringify(message);
  if (json.length < COMPRESSION_THRESHOLD || typeof CompressionStream === "undefined") {
    return message;
  }
  try {
    const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("gzip"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    if (compressed.byteLength >= json.length * 0.9) return message;
    return { [COMPRESSED_MARKER]: true, data: bytesToBase64(compressed) };
  } catch (_) {
    return message;
  }
}

export async function decodeMessage<T>(wire: unknown): Promise<T | null> {
  if (!wire || typeof wire !== "object") return null;
  const packet = wire as Record<string, unknown>;
  if (packet[COMPRESSED_MARKER] !== true) return wire as T;
  if (typeof packet.data !== "string" || typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([base64ToBytes(packet.data)]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text()) as T;
  } catch (_) {
    return null;
  }
}

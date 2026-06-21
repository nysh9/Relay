/**
 * Deepgram's LiveClient.send() type only accepts ArrayBuffer | SharedArrayBuffer
 * | Blob — not a Node Buffer/Uint8Array view directly, even though Buffer is
 * structurally a Uint8Array. Node Buffers can also be views into a larger
 * underlying ArrayBuffer (byteOffset/byteLength), so we slice out exactly the
 * bytes this chunk represents rather than handing over the whole backing buffer.
 */
export function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

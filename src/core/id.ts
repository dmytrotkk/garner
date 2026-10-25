export function uuidv7(now = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  const view = new DataView(bytes.buffer)
  view.setUint16(0, Math.floor(now / 2 ** 32))
  view.setUint32(2, now % 2 ** 32)
  view.setUint8(6, 0x70 | (view.getUint8(6) & 0x0f))
  view.setUint8(8, 0x80 | (view.getUint8(8) & 0x3f))
  const hex = bytes.toHex()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

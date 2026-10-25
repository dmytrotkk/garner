const unreadable = () => new Error('The spreadsheet cannot be read.')

function workbook(bytes: Uint8Array) {
  const file = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const shift = file.getUint16(30, true)
  const size = 1 << shift
  if (file.getUint32(44, true) > 109) throw unreadable()
  const offset = (id: number) => (id + 1) << shift
  const fat = Array.from({ length: file.getUint32(44, true) }, (_, sector) =>
    Array.from({ length: size / 4 }, (_, entry) =>
      file.getUint32(offset(file.getUint32(76 + sector * 4, true)) + entry * 4, true),
    ),
  ).flat()
  const stream = (start: number, length: number) => {
    if (length > bytes.length) throw unreadable()
    const out = new Uint8Array(length)
    for (let id = start, at = 0; at < length; id = fat[id] ?? -1, at += size) {
      const end = offset(id) + Math.min(size, length - at)
      if (id < 0 || id >= 0xfffffffa || end > bytes.length) throw unreadable()
      out.set(bytes.subarray(offset(id), end), at)
    }
    return out
  }
  const root = file.getUint32(48, true)
  let count = 0
  for (let id = root; id < 0xfffffffa && count <= fat.length; id = fat[id] ?? 0xfffffffe) count++
  const directory = new DataView(stream(root, count * size).buffer)
  for (let at = 0; at < directory.byteLength; at += 128) {
    const name = String.fromCharCode(
      ...Array.from({ length: 8 }, (_, char) => directory.getUint16(at + char * 2, true)),
    )
    const length = directory.getUint32(at + 120, true)
    if (name === 'Workbook' && directory.getUint16(at + 64, true) === 18) {
      if (length < file.getUint32(56, true)) throw unreadable()
      return stream(directory.getUint32(at + 116, true), length)
    }
  }
  throw unreadable()
}

function* records(stream: Uint8Array) {
  const view = new DataView(stream.buffer)
  for (let at = 0; at + 4 <= stream.length; at += 4 + view.getUint16(at + 2, true))
    yield {
      type: view.getUint16(at, true),
      data: new DataView(stream.buffer, at + 4, view.getUint16(at + 2, true)),
    }
}

function strings(parts: readonly DataView[]) {
  let part = 0
  let at = 0
  const byte = () => {
    const view = parts[part]
    if (!view) throw unreadable()
    if (at < view.byteLength) return view.getUint8(at++)
    part++
    at = 0
    return byte()
  }
  const word = () => byte() | (byte() << 8)
  const long = () => (word() | (word() << 16)) >>> 0
  long()
  return Array.from({ length: long() }, () => {
    const length = word()
    let flags = byte()
    const tail = (flags & 8 ? word() * 4 : 0) + (flags & 4 ? long() : 0)
    let text = ''
    while (text.length < length) {
      if (at === parts[part]?.byteLength) {
        part++
        at = 0
        flags = byte()
      }
      text += String.fromCharCode(flags & 1 ? word() : byte())
    }
    for (let skipped = 0; skipped < tail; skipped++) byte()
    return text
  })
}

function read(bytes: Uint8Array) {
  const all = [...records(workbook(bytes))]
  const sst = all.findIndex(({ type }) => type === 0xfc)
  const sstEnd = all.findIndex(({ type }, at) => at > sst && type !== 0x3c)
  const shared = sst < 0 ? [] : strings(all.slice(sst, sstEnd).map(({ data }) => data))
  const sheet = all.findIndex(({ type }, at) => at > 0 && type === 0x809)
  const sheetEnd = all.findIndex(({ type }, at) => at > sheet && type === 0x0a)
  const rows = new Map<number, string[]>()
  for (const { type, data } of all.slice(sheet, sheetEnd)) {
    const cell =
      type === 0xfd
        ? shared[data.getUint32(6, true)]
        : type === 0x203
          ? String(data.getFloat64(6, true))
          : undefined
    if (cell === undefined) continue
    const row = rows.get(data.getUint16(0, true)) ?? []
    row[data.getUint16(2, true)] = cell
    rows.set(data.getUint16(0, true), row)
  }
  return [...rows].sort(([a], [b]) => a - b).map(([, row]) => Array.from(row, (cell) => cell ?? ''))
}

export function xls(bytes: Uint8Array) {
  try {
    return read(bytes)
  } catch {
    throw unreadable()
  }
}

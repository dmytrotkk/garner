import { strFromU8, unzipSync } from 'fflate'

const unreadable = () => new Error('The spreadsheet cannot be read.')
const tag = (name: string) => `<(?:\\w+:)?${name}\\b`
const close = (name: string) => `</(?:\\w+:)?${name}>`
const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (text: string) =>
  text.replace(/&(amp|lt|gt|quot|apos);|&#(\d+);|&#x([0-9a-f]+);/gi, (_, name, dec, hex) =>
    dec
      ? String.fromCodePoint(Number(dec))
      : hex
        ? String.fromCodePoint(Number.parseInt(hex, 16))
        : (named[name.toLowerCase()] ?? ''),
  )
const texts = (xml: string) =>
  [...xml.matchAll(new RegExp(`${tag('t')}[^>]*>([^<]*)${close('t')}`, 'g'))]
    .map(([, text]) => decode(text ?? ''))
    .join('')
const builtin = new Set([
  14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55,
  56, 57, 58,
])
const epoch = Date.UTC(1899, 11, 30)
const column = (letters: string) =>
  [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1
const day = (serial: number) => {
  const date = new Date(epoch + Math.floor(serial) * 86_400_000)
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(date.getUTCDate())}-${pad(date.getUTCMonth() + 1)}-${date.getUTCFullYear()}`
}

function read(bytes: Uint8Array) {
  const files = unzipSync(bytes)
  const part = (name: string) => {
    const file = files[name]
    if (!file) throw unreadable()
    return strFromU8(file)
  }
  const [sheet] = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => a.length - b.length || a.localeCompare(b))
  if (!sheet) throw unreadable()
  const shared = files['xl/sharedStrings.xml']
    ? [
        ...part('xl/sharedStrings.xml').matchAll(
          new RegExp(`${tag('si')}>([\\s\\S]*?)${close('si')}`, 'g'),
        ),
      ].map(([, inner]) => texts(inner ?? ''))
    : []
  const styles = files['xl/styles.xml'] ? part('xl/styles.xml') : ''
  const block = (name: string) =>
    styles.match(new RegExp(`${tag(name)}[^>]*>([\\s\\S]*?)${close(name)}`))?.[1] ?? ''
  const formats = new Map(
    [
      ...block('numFmts').matchAll(
        /<(?:\w+:)?numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g,
      ),
    ].map(([, id, code]) => [Number(id), decode(code ?? '')]),
  )
  const xfs = [...block('cellXfs').matchAll(/<(?:\w+:)?xf\b[^>]*numFmtId="(\d+)"/g)].map(([, id]) =>
    Number(id),
  )
  const dated = (style: number) => {
    const id = xfs[style]
    if (id === undefined) return false
    const code = formats.get(id)
    return code === undefined
      ? builtin.has(id)
      : /[dmy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, ''))
  }
  const rows = new Map<number, string[]>()
  const cell = new RegExp(`${tag('c')}([^>]*?)(?:/>|>([\\s\\S]*?)${close('c')})`, 'g')
  for (const [, attrs = '', inner = ''] of part(sheet).matchAll(cell)) {
    const [, letters, line] = /\br="([A-Z]+)(\d+)"/.exec(attrs) ?? []
    if (!letters || !line) throw unreadable()
    const type = /\bt="(\w+)"/.exec(attrs)?.[1] ?? 'n'
    const style = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? -1)
    const value = new RegExp(`${tag('v')}>([^<]*)${close('v')}`).exec(inner)?.[1]
    const text =
      type === 's'
        ? (shared[Number(value)] ?? '')
        : type === 'inlineStr'
          ? texts(inner)
          : type === 'str'
            ? decode(value ?? '')
            : type === 'b'
              ? value === '1'
                ? 'TRUE'
                : 'FALSE'
              : value === undefined
                ? ''
                : dated(style)
                  ? day(Number(value))
                  : String(Number(value))
    const row = rows.get(Number(line)) ?? []
    row[column(letters)] = text
    rows.set(Number(line), row)
  }
  return [...rows].sort(([a], [b]) => a - b).map(([, row]) => Array.from(row, (text) => text ?? ''))
}

export function xlsx(bytes: Uint8Array) {
  try {
    return read(bytes)
  } catch {
    throw unreadable()
  }
}

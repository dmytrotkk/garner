import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { $ } from 'bun'

type Notice = { name: string; users: string[] }
type Crate = { name: string; version: string }
type About = { licenses: { name: string; text: string; used_by: { crate: Crate }[] }[] }
type Manifest = { name: string; version: string; license?: string; dependencies?: object }

const root = process.cwd()
const notices = new Map<string, Notice>()
const add = (text: string, name: string, user: string) => {
  const notice = notices.get(text) ?? { name, users: [] }
  notice.users.push(user)
  notices.set(text, notice)
}

const about: About = await $`cargo about generate --format json`.cwd('src-tauri').quiet().json()
for (const { name, text, used_by } of about.licenses)
  for (const { crate } of used_by) add(text, name, `${crate.name} ${crate.version}`)

const vendored = {
  'LICENSE-evilcharts': 'EvilCharts',
  'LICENSE-flag-icons': 'flag-icons',
  'LICENSE-web3icons': 'Web3 Icons',
}
for (const [file, user] of Object.entries(vendored))
  add(await Bun.file(file).text(), 'MIT License', user)

const locate = async (name: string, from: string): Promise<string | undefined> => {
  const candidate = join(from, 'node_modules', name)
  if (await Bun.file(join(candidate, 'package.json')).exists()) return candidate
  return from === root ? undefined : locate(name, dirname(from))
}

const bare: string[] = []
const seen = new Set<string>()
const visit = async (from: string, names: readonly string[]) => {
  for (const name of names) {
    const dir = await locate(name, from)
    if (!dir || seen.has(dir)) continue
    seen.add(dir)
    const manifest: Manifest = await Bun.file(join(dir, 'package.json')).json()
    const top = (await readdir(dir)).filter((file) => /^(licen[cs]e|copying|notice)/i.test(file))
    const files = top.length
      ? top
      : (await Array.fromAsync(new Bun.Glob('**/LICENSE').scan({ cwd: dir }))).filter(
          (file) => !file.includes('node_modules'),
        )
    const user = `${manifest.name} ${manifest.version}`
    if (!files.length) bare.push(user)
    for (const file of files)
      add(await Bun.file(join(dir, file)).text(), manifest.license ?? file, user)
    await visit(dir, Object.keys(manifest.dependencies ?? {}))
  }
}
const own: Manifest = await Bun.file('package.json').json()
await visit(root, Object.keys(own.dependencies ?? {}))

const rtf = (text: string) =>
  [...text.replaceAll('\r', '')]
    .map((char) => {
      if (char === '\\' || char === '{' || char === '}') return `\\${char}`
      if (char === '\n') return '\\line\n'
      if (char === '\t') return '\\tab '
      return char.charCodeAt(0) < 128
        ? char
        : [...Array(char.length).keys()]
            .map((at) => char.charCodeAt(at))
            .map((unit) => `\\u${unit > 32767 ? unit - 65536 : unit}?`)
            .join('')
    })
    .join('')

const line = (body: string, style = '\\qc\\sa40') => `\\pard${style} ${body}\\par\n`
const head = (text: string) => line(`{\\b ${rtf(text)}}`, '\\qc\\sb320\\sa120')
const small = (text: string, style?: string) => line(`{\\fs17 ${rtf(text)}}`, style)
const link = (url: string, text: string) =>
  `{\\field{\\*\\fldinst{HYPERLINK "${url}"}}{\\fldrslt{${rtf(text)}}}}`
const data = [
  line(link('https://www.coingecko.com/en/api', 'Powered by CoinGecko API')),
  line(rtf('Prices and token logos from DefiLlama')),
  line(rtf('Exchange rates from the European Central Bank via Frankfurter, cross rates derived')),
  line(rtf('Balances read through PublicNode')),
  small('Shown as is, not financial advice', '\\qc\\sb120'),
]
const licenses = [...notices]
  .sort(([, a], [, b]) => b.users.length - a.users.length)
  .map(
    ([text, { name, users }]) =>
      line(`{\\b ${rtf(name)}}`, '\\qc\\sb240\\sa60') +
      small(users.sort().join(', '), '\\qc\\sa120') +
      line(`{\\fs16 ${rtf(text.trim())}}`, '\\ql\\sa120'),
  )
const document = [
  '{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0\\fnil .AppleSystemUIFont;}}\\f0\\fs20\n',
  head('Data'),
  ...data,
  head('Open source'),
  small('Brand marks belong to their owners, drawn from Simple Icons and Web3 Icons.'),
  ...licenses,
  '}',
].join('')
await Bun.write('src-tauri/target/Credits.rtf', document)
console.log(
  `${notices.size} notices for ${about.licenses.reduce((n, { used_by }) => n + used_by.length, 0)} crates and ${seen.size} npm packages`,
)
if (bare.length) console.log(`no license file: ${bare.join(', ')}`)

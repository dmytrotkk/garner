import { expect, test } from 'bun:test'
import { strToU8, zipSync } from 'fflate'
import { open, view } from './statement'
import { xlsx } from './xlsx'

const main = 'xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'

const book = (sheet: string, extra: Record<string, string> = {}) =>
  zipSync({
    'xl/workbook.xml': strToU8(
      `<x:workbook ${main}><x:sheets><x:sheet name="s" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
    ),
    'xl/sharedStrings.xml': strToU8(
      `<x:sst ${main}><x:si><x:t>Moeda:</x:t></x:si><x:si><x:r><x:t>Caf</x:t></x:r><x:r><x:t xml:space="preserve">é &amp; chá</x:t></x:r></x:si><x:si><x:t></x:t></x:si></x:sst>`,
    ),
    'xl/styles.xml': strToU8(
      `<x:styleSheet ${main}><x:numFmts count="2"><x:numFmt numFmtId="165" formatCode="dd/MM/yyyy"/><x:numFmt numFmtId="166" formatCode="#,##0.00;-#,##0.00"/></x:numFmts><x:cellXfs count="4"><x:xf numFmtId="0"/><x:xf numFmtId="165"/><x:xf numFmtId="166"/><x:xf numFmtId="14"/></x:cellXfs><x:dxfs count="1"><x:dxf><x:numFmt numFmtId="165" formatCode="#,##0.00"/></x:dxf></x:dxfs></x:styleSheet>`,
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<x:worksheet ${main}><x:sheetData>${sheet}</x:sheetData></x:worksheet>`,
    ),
    ...Object.fromEntries(Object.entries(extra).map(([name, text]) => [name, strToU8(text)])),
  })

const sheet = [
  '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>EUR</x:t></x:is></x:c><x:c r="C1"/></x:row>',
  '<x:row r="3"><x:c r="A3" s="1"><x:v>46023</x:v></x:c><x:c r="B3" s="3"><x:v>46023.75</x:v></x:c><x:c r="C3" t="s"><x:v>1</x:v></x:c><x:c r="D3" s="2"><x:v>-4.5</x:v></x:c><x:c r="F3" t="b"><x:v>1</x:v></x:c><x:c r="G3" t="str"><x:v>a &lt; b</x:v></x:c></x:row>',
].join('')

test('an xlsx renders its first sheet: shared and inline strings, dates by the numFmts block, numbers, booleans, gaps', () => {
  expect(xlsx(book(sheet))).toEqual([
    ['Moeda:', 'EUR', ''],
    ['01-01-2026', '01-01-2026', 'Café & chá', '-4.5', '', 'TRUE', 'a < b'],
  ])
})

test('the lowest numbered sheet is read and a broken zip is refused', () => {
  const two = book(sheet, {
    'xl/worksheets/sheet10.xml': `<x:worksheet ${main}><x:sheetData><x:row r="1"><x:c r="A1"><x:v>10</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
  })
  expect(xlsx(two)[0]).toEqual(['Moeda:', 'EUR', ''])
  expect(() => xlsx(new Uint8Array([80, 75, 3, 4, 0, 0]))).toThrow(
    'The spreadsheet cannot be read.',
  )
})

test('open keeps a workbook as base64 and view renders it as a tab separated table', () => {
  const bytes = book(sheet)
  const doc = open('mov.xlsx', bytes)
  expect(doc.text).toBe(bytes.toBase64())
  expect(view(doc.text)).toBe(
    'Moeda:\tEUR\t\n01-01-2026\t01-01-2026\tCafé & chá\t-4.5\t\tTRUE\ta < b',
  )
})

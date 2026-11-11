import { expect, test } from 'bun:test'
import { book } from '../../host/fresh.ts'
import { cells, open, view } from './statement.ts'
import { xls } from './xls.ts'

const printed = [['Title'], ['Café ok', '', '-1234.56'], ['', 'Ca\tf']]

test('a workbook reads to the rows of its first sheet, strings across a continue and numbers as printed', () => {
  expect(xls(book())).toEqual(printed)
})

test('open keeps a spreadsheet as base64 and view renders it to rows that read back the same', () => {
  const doc = open('book.xls', book())
  expect(doc.text).toStartWith('0M8R4KGxGuE')
  expect(cells(view(doc.text), '\t')).toEqual(printed)
  expect(view(open('a.csv', new TextEncoder().encode('a,b\n')).text)).toBe('a,b\n')
})

test('a damaged workbook is refused with the reader error', () => {
  for (const damaged of [book().slice(0, 100), book().with(30, 0), book().slice(0, 2600)])
    expect(() => xls(damaged)).toThrow('The spreadsheet cannot be read.')
})

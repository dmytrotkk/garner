import { expect, test } from 'bun:test'
import { type Layer, next, type Prompt } from './-layer.ts'

const none: Layer = { kind: 'none' }
const palette: Layer = { kind: 'palette', query: '' }
const prompt: Layer = { kind: 'prompt', prompt: { kind: 'add-institution' } }

test('search toggles the palette and does nothing over a prompt', () => {
  expect(next(none, { type: 'search' })).toEqual(palette)
  expect(next(palette, { type: 'search' })).toEqual(none)
  expect(next(prompt, { type: 'search' })).toBe(prompt)
})

test('refine opens the palette seeded with its query, from none only', () => {
  const seeded = next(none, { type: 'refine', query: 'coffee 2025' })
  expect(seeded).toEqual({ kind: 'palette', query: 'coffee 2025' })
  expect(next(seeded, { type: 'search' })).toEqual(none)
  expect(next(palette, { type: 'refine', query: 'coffee' })).toBe(palette)
  expect(next(prompt, { type: 'refine', query: 'coffee' })).toBe(prompt)
})

test('closing an import of several files opens the next file, and the last one closes', () => {
  const files = [new File(['x'], 'a.csv'), new File(['x'], 'b.csv')]
  const first: Prompt = {
    kind: 'import',
    key: 'k',
    files,
    at: 0,
    institutionId: undefined,
    accountId: undefined,
  }
  const batch: Layer = { kind: 'prompt', prompt: first }
  const second = next(batch, { type: 'close', of: 'prompt' })
  expect(second).toEqual({ kind: 'prompt', prompt: { ...first, at: 1 } })
  expect(next(second, { type: 'close', of: 'prompt' })).toEqual(none)
  expect(next(batch, { type: 'close', of: 'palette' })).toBe(batch)
})

test('a prompt opens over the palette, never over another prompt, and a close only closes its own layer', () => {
  expect(next(palette, { type: 'ask', prompt: { kind: 'add-institution' } })).toEqual(prompt)
  expect(next(prompt, { type: 'ask', prompt: { kind: 'add-institution' } })).toBe(prompt)
  expect(next(prompt, { type: 'close', of: 'palette' })).toBe(prompt)
  expect(next(prompt, { type: 'close', of: 'prompt' })).toEqual(none)
  expect(next(palette, { type: 'close', of: 'palette' })).toEqual(none)
})

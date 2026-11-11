import { expect, test } from 'bun:test'
import { fromLinks } from './-connect.tsx'

test('the apps row reads the worst link first: failed, then confirm, then missing', () => {
  expect(fromLinks([])).toEqual({ status: 'none' })
  expect(
    fromLinks([
      { app: 'Claude Code', state: 'connected' },
      { app: 'Codex', state: 'connected' },
    ]),
  ).toEqual({ status: 'connected' })
  expect(
    fromLinks([
      { app: 'Claude Code', state: 'connected' },
      { app: 'Codex', state: 'missing' },
    ]),
  ).toEqual({ status: 'missing' })
  expect(
    fromLinks([
      { app: 'Claude Desktop', state: 'confirm' },
      { app: 'Codex', state: 'missing' },
    ]),
  ).toEqual({ status: 'confirm' })
  expect(
    fromLinks([
      { app: 'Claude Desktop', state: 'confirm' },
      { app: 'Codex', state: 'failed' },
    ]),
  ).toEqual({ status: 'failed', reason: 'Codex failed, confirm in Claude Desktop' })
})

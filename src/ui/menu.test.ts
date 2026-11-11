import { expect, test } from 'bun:test'
import type { Action } from './command.ts'
import { type Entry, menuOn, menuUnder, provideMenu } from './menu.tsx'
import { type SymbolName, symbols } from './symbols.ts'

test('native menus show title-cased entries, a separator before a later negative item, mark their element while open, and run the pick', async () => {
  const ran: string[] = []
  const action = (id: string, label: string, symbol: SymbolName, negative = false): Action => ({
    id,
    group: 'Actions',
    label,
    icon: symbols[symbol],
    symbol,
    run: () => {
      ran.push(id)
    },
    ...(negative && { tone: 'negative' as const }),
  })
  const shown: { entries: readonly Entry[]; at: { x: number; y: number } }[] = []
  provideMenu(async (entries, at, pick) => {
    shown.push({ entries, at })
    pick(entries.length - 1)
  })
  const flags: string[] = []
  const press = (clientX: number, clientY: number) => ({
    clientX,
    clientY,
    currentTarget: {
      toggleAttribute: (name: string, force: boolean) => {
        flags.push(`${force ? '+' : '-'}${name}`)
        return Boolean(force)
      },
      getBoundingClientRect: () => ({ left: 40, bottom: 38 }),
    },
    preventDefault: () => {},
  })
  const items = [action('add', 'Add account…', 'plus'), action('remove', 'Remove…', 'trash', true)]

  expect(menuOn([])).toEqual({})
  expect(menuUnder([])).toBeUndefined()
  await menuOn(items).onContextMenu?.(press(12, 34))
  await menuUnder(items)?.(press(0, 0))
  await menuOn([action('remove', 'Remove…', 'trash', true)]).onContextMenu?.(press(0, 0))

  expect(shown).toEqual([
    {
      entries: [
        { label: 'Add Account…', symbol: 'plus', separated: false },
        { label: 'Remove…', symbol: 'trash', separated: true },
      ],
      at: { x: 12, y: 34 },
    },
    { entries: shown[0]?.entries ?? [], at: { x: 40, y: 42 } },
    { entries: [{ label: 'Remove…', symbol: 'trash', separated: false }], at: { x: 0, y: 0 } },
  ])
  expect(flags).toEqual([
    '+data-menu-open',
    '-data-menu-open',
    '+data-popup-open',
    '-data-popup-open',
    '+data-menu-open',
    '-data-menu-open',
  ])
  expect(ran).toEqual(['remove', 'remove', 'remove'])
})

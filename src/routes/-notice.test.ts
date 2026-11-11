import { expect, test } from 'bun:test'
import { type Dismissal, settle } from './-notice.ts'

test('a closed notice stays closed while the count falls and shows again once it rises', () => {
  const shown: Dismissal = { state: 'shown' }
  expect(settle(shown, 0)).toBe(shown)
  const closed: Dismissal = { state: 'closed', at: 312 }
  expect(settle(closed, 312)).toBe(closed)
  const lower = settle(closed, 0)
  expect(lower).toEqual({ state: 'closed', at: 0 })
  expect(settle(lower, 40)).toEqual(shown)
})

import { expect, test } from 'bun:test'
import { migrated } from '../../host/fresh.ts'
import { read } from '../data/imports.ts'
import { type ImportFlow, next } from './-import.ts'

const text = [
  'Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance',
  'Card Payment,Current,2026-01-05 09:00:00,2026-01-05 09:00:00,Cafe,-4.50,0.00,EUR,COMPLETED,995.50',
  'Transfer,Savings,2026-01-06 10:00:00,2026-01-06 10:00:00,Saved,100.00,0.00,EUR,COMPLETED,450.00',
  '',
].join('\n')

const drafted = async () => read(await migrated(), [{ name: 'january.csv', text }])

const reading: ImportFlow = { state: 'reading', pick: 2 }

test('a read that answers an older pick is ignored, the current one opens the preview', async () => {
  const { draft, route } = await drafted()
  expect(next(reading, { type: 'read', pick: 1, draft, route })).toBe(reading)
  expect(next(reading, { type: 'reject', pick: 1, error: 'late' })).toBe(reading)
  const preview = next(reading, { type: 'read', pick: 2, draft, route })
  expect(preview).toMatchObject({ state: 'preview', plan: { blocked: null } })
  expect(next(preview, { type: 'read', pick: 1, draft, route })).toBe(preview)
  expect(next(preview, { type: 'fail', error: 'stray' })).toBe(preview)
  expect(next(reading, { type: 'reject', pick: 2, error: 'Row 3' })).toEqual({
    state: 'invalid',
    error: 'Row 3',
  })
  expect(next({ state: 'invalid', error: 'Row 3' }, { type: 'pick', pick: 3 })).toEqual({
    state: 'reading',
    pick: 3,
  })
})

test('a route replans the preview, and a blocked plan cannot be applied', async () => {
  const { draft, route } = await drafted()
  const preview = next(reading, { type: 'read', pick: 2, draft, route })
  const [current, savings] = draft.controls
  const shared = { ...route, [savings?.key ?? '']: route[current?.key ?? ''] as never }
  const blocked = next(preview, { type: 'route', route: shared })
  expect(blocked).toMatchObject({ state: 'preview', plan: { blocked: { reason: 'shared' } } })
  expect(next(blocked, { type: 'apply' })).toBe(blocked)
  expect(next(reading, { type: 'route', route })).toBe(reading)
  expect(next(next(blocked, { type: 'route', route }), { type: 'apply' })).toMatchObject({
    state: 'applying',
  })
})

test('nothing interrupts an apply, a failure keeps the plan and can be retried', async () => {
  const { draft, route } = await drafted()
  const applying = next(next(reading, { type: 'read', pick: 2, draft, route }), { type: 'apply' })
  expect(next(applying, { type: 'pick', pick: 3 })).toBe(applying)
  expect(next(applying, { type: 'route', route: {} })).toBe(applying)
  const failed = next(applying, { type: 'fail', error: 'disk full' })
  expect(failed).toMatchObject({ state: 'failed', error: 'disk full', plan: { blocked: null } })
  expect(next(failed, { type: 'route', route: {} })).toBe(failed)
  expect(next(failed, { type: 'apply' })).toMatchObject({ state: 'applying' })
  expect(next(reading, { type: 'fail', error: 'stray' })).toBe(reading)
})

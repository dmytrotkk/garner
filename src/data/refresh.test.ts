import { expect, test } from 'bun:test'
import { next, type Sync } from './refresh'

const idle: Sync = { status: 'idle' }
const running: Sync = { status: 'running', again: false }
const queued: Sync = { status: 'running', again: true }
const failed: Sync = { status: 'failed', error: 'rpc down', at: 5 }

test('a request starts a run, and one made during a run queues exactly one more', () => {
  expect(next(idle, { type: 'request' })).toEqual(running)
  expect(next(failed, { type: 'request' })).toEqual(running)
  expect(next(running, { type: 'request' })).toEqual(queued)
  expect(next(queued, { type: 'request' })).toEqual(queued)
})

test('a run ends idle or failed, unless a request is queued, which runs next', () => {
  expect(next(running, { type: 'done' })).toEqual(idle)
  expect(next(running, { type: 'fail', error: 'rpc down', at: 5 })).toEqual(failed)
  expect(next(queued, { type: 'done' })).toEqual(running)
  expect(next(queued, { type: 'fail', error: 'rpc down', at: 5 })).toEqual(running)
})

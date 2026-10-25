import { store } from '../core/store'
import type { Db } from './db'
import type { Fetch } from './host'
import { sync } from './sync'

export type Sync =
  | { status: 'idle' }
  | { status: 'running'; again: boolean }
  | { status: 'failed'; error: string; at: number }

type Event = { type: 'request' } | { type: 'done' } | { type: 'fail'; error: string; at: number }

export function next(state: Sync, event: Event): Sync {
  if (event.type === 'request') return { status: 'running', again: state.status === 'running' }
  if (state.status === 'running' && state.again) return { status: 'running', again: false }
  return event.type === 'done'
    ? { status: 'idle' }
    : { status: 'failed', error: event.error, at: event.at }
}

const state = store<Sync>({ status: 'idle' })

export async function refresh(db: Db, fetch: Fetch, done: () => Promise<void>) {
  const before = state.get()
  state.set(next(before, { type: 'request' }))
  if (before.status === 'running') return
  while (state.get().status === 'running') {
    try {
      await sync(db, fetch)
      await done()
      state.set(next(state.get(), { type: 'done' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.set(next(state.get(), { type: 'fail', error: message, at: Date.now() }))
    }
  }
}

import { store } from '../core/store.ts'

export type Dismissal = { state: 'shown' } | { state: 'closed'; at: number }

export function settle(dismissal: Dismissal, open: number): Dismissal {
  if (dismissal.state === 'shown') return dismissal
  if (open > dismissal.at) return { state: 'shown' }
  return open < dismissal.at ? { state: 'closed', at: open } : dismissal
}

const shown: Dismissal = { state: 'shown' }
const dismissals = store<Readonly<Record<string, Dismissal>>>({})
const current = (key: string) => dismissals.get()[key] ?? shown

export const useDismissal = (key: string) => dismissals.use()[key] ?? shown
export const observe = (key: string, open: number) =>
  dismissals.set({ ...dismissals.get(), [key]: settle(current(key), open) })
export const dismiss = (key: string, open: number) =>
  dismissals.set({ ...dismissals.get(), [key]: { state: 'closed', at: open } })

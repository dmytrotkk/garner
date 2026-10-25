import { useSyncExternalStore } from 'react'

export function store<State>(initial: State) {
  let state = initial
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  return {
    get: () => state,
    set(next: State) {
      state = next
      for (const listener of listeners) listener()
    },
    use: () => useSyncExternalStore(subscribe, () => state),
  }
}

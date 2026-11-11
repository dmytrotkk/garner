import { getRouteApi, useRouter } from '@tanstack/react-router'
import { refresh } from '../data/refresh.ts'
import { type Currency, setCurrency, setSetting } from '../data/settings.ts'

export const root = getRouteApi('__root__')

export function useSync() {
  const { db, fetch } = root.useRouteContext()
  const router = useRouter()
  return () => refresh(db, fetch, () => router.invalidate())
}

export function useSettings() {
  const { db, fetch } = root.useRouteContext()
  const { currency } = root.useLoaderData()
  const router = useRouter()
  const sync = useSync()
  return {
    privacy: async (value: boolean) => {
      await db.write(setSetting('privacy', value))
      await router.invalidate()
    },
    currency: async (value: Currency) => {
      if (value === currency) return
      await setCurrency(db, fetch, value)
      await router.invalidate()
      if (value !== 'USD') sync()
    },
  }
}

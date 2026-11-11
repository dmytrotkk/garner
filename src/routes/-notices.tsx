import type { Noticed } from '../ui/notices.tsx'
import { useCategorizeNotice } from './-categories.tsx'
import { useTransfersNotice } from './-flows.tsx'

export function useNotices(): Noticed[] {
  const transfers = useTransfersNotice()
  const categorize = useCategorizeNotice()
  return [
    { key: 'transfers', node: transfers },
    { key: 'categorize', node: categorize },
  ].filter(({ node }) => node !== undefined)
}

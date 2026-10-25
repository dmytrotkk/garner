import type { Noticed } from '../ui/notices'
import { useCategorizeNotice } from './-categories'
import { useTransfersNotice } from './-flows'

export function useNotices(): Noticed[] {
  const transfers = useTransfersNotice()
  const categorize = useCategorizeNotice()
  return [
    { key: 'transfers', node: transfers },
    { key: 'categorize', node: categorize },
  ].filter(({ node }) => node !== undefined)
}

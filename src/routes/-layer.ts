import { store } from '../core/store.ts'
import type { Assignable, CategoryRow, MerchantRow, RuleRow } from '../data/categories.ts'
import type { Proposal } from '../data/flows.ts'
import type { Identity, Movement, MovementKey } from '../data/ledger.ts'
import type { AccountView, InstitutionView, Position } from '../data/portfolio.ts'
import type { Account, Institution, ManualAccount } from '../data/schema.ts'
import type { LegKey } from '../data/transfers.ts'

export type ManualView = Extract<AccountView, { kind: 'manual' }>

export type Prompt =
  | { kind: 'add-institution' }
  | { kind: 'add-account' | 'rename-institution'; institution: Institution }
  | { kind: 'remove-institution'; institution: InstitutionView }
  | { kind: 'rename-account' | 'remove-account'; account: Account }
  | { kind: 'add-holding'; account: ManualView }
  | { kind: 'edit-holding' | 'remove-holding'; account: ManualAccount; holding: Position }
  | {
      kind: 'import'
      key: string
      files: readonly File[]
      at: number
      institutionId: string | undefined
      accountId: string | undefined
    }
  | { kind: 'remove-import'; file: { id: string; name: string } }
  | { kind: 'categorize'; movement: Assignable; title: string; party: string; chosen: boolean }
  | { kind: 'note'; movement: MovementKey; title: string; note: string | null }
  | { kind: 'add-category' }
  | { kind: 'edit-category' | 'remove-category'; category: CategoryRow }
  | { kind: 'change-rule' | 'remove-rule'; rule: RuleRow }
  | { kind: 'identify'; party: string; title: string; identity: Identity }
  | {
      kind: 'transfer'
      movement: Extract<Movement, { kind: 'transfer' }>
      title: string
      initial: LegKey | undefined
    }
  | { kind: 'pair'; proposal: Proposal }
  | { kind: 'decide'; key: LegKey; title: string; action: 'Not a transfer' | 'Unpair' | 'Undo' }
  | { kind: 'add-merchant' }
  | { kind: 'edit-merchant' | 'remove-merchant'; merchant: MerchantRow }
  | { kind: 'clear-ai'; rules: number; merchants: number }

export type Layer =
  | { kind: 'none' }
  | { kind: 'palette'; query: string }
  | { kind: 'prompt'; prompt: Prompt }

type Event =
  | { type: 'ask'; prompt: Prompt }
  | { type: 'search' }
  | { type: 'refine'; query: string }
  | { type: 'close'; of: 'palette' | 'prompt' }

const none: Layer = { kind: 'none' }

export function next(layer: Layer, event: Event): Layer {
  switch (event.type) {
    case 'ask':
      return layer.kind === 'prompt' ? layer : { kind: 'prompt', prompt: event.prompt }
    case 'search':
      if (layer.kind === 'prompt') return layer
      return layer.kind === 'palette' ? none : { kind: 'palette', query: '' }
    case 'refine':
      return layer.kind === 'none' ? { kind: 'palette', query: event.query } : layer
    case 'close':
      if (layer.kind !== event.of) return layer
      return layer.kind === 'prompt' &&
        layer.prompt.kind === 'import' &&
        layer.prompt.at + 1 < layer.prompt.files.length
        ? { kind: 'prompt', prompt: { ...layer.prompt, at: layer.prompt.at + 1 } }
        : none
  }
}

const layer = store<Layer>(none)
const send = (event: Event) => layer.set(next(layer.get(), event))

export const useLayer = layer.use
export const ask = (prompt: Prompt) => send({ type: 'ask', prompt })
export const load = (files: readonly File[], institutionId?: string, accountId?: string) =>
  files.length &&
  ask({ kind: 'import', key: crypto.randomUUID(), files, at: 0, institutionId, accountId })
export const search = () => send({ type: 'search' })
export const refine = (query: string) => send({ type: 'refine', query })
export const close = (of: 'palette' | 'prompt') => send({ type: 'close', of })

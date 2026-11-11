import { type Draft, type Plan, plan, type Route } from '../data/imports.ts'

export type ImportFlow =
  | { state: 'reading'; pick: number }
  | { state: 'invalid'; error: string }
  | { state: 'preview'; draft: Draft; plan: Plan }
  | { state: 'applying'; draft: Draft; plan: Plan }
  | { state: 'failed'; draft: Draft; plan: Plan; error: string }

type ImportEvent =
  | { type: 'pick'; pick: number }
  | { type: 'read'; pick: number; draft: Draft; route: Route }
  | { type: 'reject'; pick: number; error: string }
  | { type: 'route'; route: Route }
  | { type: 'apply' }
  | { type: 'fail'; error: string }

export function next(flow: ImportFlow, event: ImportEvent): ImportFlow {
  switch (event.type) {
    case 'pick':
      return flow.state === 'applying' ? flow : { state: 'reading', pick: event.pick }
    case 'read':
      return flow.state === 'reading' && flow.pick === event.pick
        ? { state: 'preview', draft: event.draft, plan: plan(event.draft, event.route) }
        : flow
    case 'reject':
      return flow.state === 'reading' && flow.pick === event.pick
        ? { state: 'invalid', error: event.error }
        : flow
    case 'route':
      return flow.state === 'preview' ? { ...flow, plan: plan(flow.draft, event.route) } : flow
    case 'apply':
      return (flow.state === 'preview' && flow.plan.blocked === null) || flow.state === 'failed'
        ? { state: 'applying', draft: flow.draft, plan: flow.plan }
        : flow
    case 'fail':
      return flow.state === 'applying' ? { ...flow, state: 'failed', error: event.error } : flow
  }
}

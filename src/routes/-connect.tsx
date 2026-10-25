import { useEffect, useState } from 'react'
import type { Link } from '../data/host'
import { Button } from '../ui/button'
import { root } from './-data'

type Apps =
  | { status: 'checking' | 'installing' | 'none' | 'connected' | 'missing' | 'confirm' }
  | { status: 'failed'; reason: string }

export function fromLinks(links: readonly Link[]): Apps {
  const failed = links.filter(({ state }) => state === 'failed').map(({ app }) => app)
  const confirm = links.some(({ state }) => state === 'confirm')
  if (failed.length) {
    const parts = [`${failed.join(', ')} failed`, confirm && 'confirm in Claude Desktop']
    return { status: 'failed', reason: parts.filter(Boolean).join(', ') }
  }
  if (!links.length) return { status: 'none' }
  if (confirm) return { status: 'confirm' }
  if (links.some(({ state }) => state === 'missing')) return { status: 'missing' }
  return { status: 'connected' }
}

const labels = {
  checking: 'Checking',
  installing: 'Connecting',
  none: 'Nothing to connect',
  connected: 'Connected',
  missing: 'Not connected',
  confirm: 'Connected, confirm in Claude Desktop',
} as const

export function Connect() {
  const { links } = root.useRouteContext()
  const [apps, setApps] = useState<Apps>({ status: 'checking' })

  const run = async (connect: boolean) => {
    setApps({ status: connect ? 'installing' : 'checking' })
    try {
      setApps(fromLinks(await links(connect)))
    } catch (error) {
      setApps({ status: 'failed', reason: error instanceof Error ? error.message : String(error) })
    }
  }

  useEffect(() => {
    run(false)
  }, [])

  return (
    <span className="flex items-center gap-3">
      <span className={apps.status === 'failed' ? 'text-negative' : 'text-dim'}>
        {apps.status === 'failed' ? apps.reason : labels[apps.status]}
      </span>
      {(apps.status === 'missing' || apps.status === 'failed') && (
        <Button variant="secondary" size="sm" onClick={() => run(true)}>
          Connect
        </Button>
      )}
    </span>
  )
}

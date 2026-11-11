import { type ErrorComponentProps, Link, useRouter } from '@tanstack/react-router'
import { Button } from '../ui/button.tsx'
import { Page } from '../ui/page.tsx'
import { Sidebar } from '../ui/sidebar.tsx'
import { useSidebar } from './-window.tsx'

export function Pending() {
  const shown = useSidebar()
  return (
    <div className="flex h-full">
      <Sidebar collapsed={!shown} footer={null}>
        {null}
      </Sidebar>
      <div className="flex-1 bg-canvas" />
    </div>
  )
}

export function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-canvas p-8">
      <div className="flex max-w-100 flex-col items-start gap-3">
        <h1 className="text-heading">Something went wrong</h1>
        <p className="text-dim">{error instanceof Error ? error.message : String(error)}</p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    </div>
  )
}

export function RouteFailure({ error }: ErrorComponentProps) {
  const router = useRouter()
  return <Failure error={error} retry={() => router.invalidate()} />
}

export function NotFound() {
  return (
    <Page title="Not found">
      <p className="text-dim">
        Nothing lives at this address.{' '}
        <Link to="/" className="transition hover:text-ink">
          Back to Home
        </Link>
      </p>
    </Page>
  )
}

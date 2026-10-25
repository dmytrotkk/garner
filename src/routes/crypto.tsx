import { createFileRoute } from '@tanstack/react-router'
import { Button } from '../ui/button'
import { Page, Section, Stat } from '../ui/page'
import { root } from './-data'
import { Institutions } from './-institutions'
import { ask } from './-layer'
import { Money } from './-money'

export const Route = createFileRoute('/crypto')({ component: Crypto })

function Crypto() {
  const { crypto, institutions: every } = root.useLoaderData()
  const institutions = every
    .filter(
      ({ accounts }) => accounts.some(({ coins }) => coins) || !accounts.some(({ cash }) => cash),
    )
    .map((institution) => ({ ...institution, value: institution.crypto }))

  return (
    <Page
      title="Crypto"
      empty={!institutions.length && 'No institutions yet. Add one, then the accounts it holds.'}
      action={
        <Button size="sm" onClick={() => ask({ kind: 'add-institution' })}>
          Add institution…
        </Button>
      }
    >
      <Stat label="Total" value={<Money value={crypto} />} />
      <Section title="Institutions">
        <Institutions institutions={institutions} />
      </Section>
    </Page>
  )
}

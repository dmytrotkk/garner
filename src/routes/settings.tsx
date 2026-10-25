import { createFileRoute } from '@tanstack/react-router'
import { currencies } from '../data/settings'
import { Copy } from '../ui/copy'
import { Page } from '../ui/page'
import { Picker } from '../ui/picker'
import { SettingsGroup, SettingsRow } from '../ui/settings'
import { Switch } from '../ui/switch'
import { Connect } from './-connect'
import { root, useSettings } from './-data'

export const Route = createFileRoute('/settings')({
  loader: ({ context }) => context.address(),
  component: Settings,
})

function Settings() {
  const { currency, privacy } = root.useLoaderData()
  const address = Route.useLoaderData()
  const set = useSettings()

  return (
    <Page title="Settings" narrow>
      <SettingsGroup label="Display">
        <SettingsRow title="Currency" description="Values are converted at the latest daily rate.">
          <Picker
            label={currency}
            items={currencies.map((next) => ({
              id: next,
              label: next,
              run: () => set.currency(next),
            }))}
          />
        </SettingsRow>
        <SettingsRow
          title="Privacy mode"
          description="Balances, amounts and shares are blurred. Prices stay visible."
        >
          <Switch label="Privacy mode" checked={privacy} onChange={(next) => set.privacy(next)} />
        </SettingsRow>
      </SettingsGroup>
      <SettingsGroup
        label="AI"
        note="Models see your balances and bank descriptions, never your addresses."
      >
        <SettingsRow title="Apps" description="Claude Code, Claude Desktop, Codex and ChatGPT.">
          <Connect />
        </SettingsRow>
        <SettingsRow title="Other apps" description={address}>
          <Copy text={address} label="Copy" />
        </SettingsRow>
      </SettingsGroup>
    </Page>
  )
}

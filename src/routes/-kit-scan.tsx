import { Card } from '../ui/card'
import { Copy } from '../ui/copy'
import { Notice } from '../ui/notice'
import { Section } from '../ui/page'
import { Scan } from '../ui/scan'
import { prompt } from './-categories'

export function KitScan() {
  return (
    <Section title="Scanner">
      <Card
        title="Scanner"
        description="A sheet of five rows: the beam sweeps down in the colours of the row it is on and each row gets its category as it passes, then the sheet clears and it starts over. Still under reduced motion."
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-end gap-4">
            <Scan size="lg" />
            <Scan />
          </div>
          <Notice
            lead={<Scan />}
            title="Let your AI app categorize 120 movements"
            text="Copy the prompt, paste it into Claude or ChatGPT, done."
            action={<Copy text={prompt} label="Copy prompt" variant="secondary" />}
            onClose={() => {}}
          />
        </div>
      </Card>
    </Section>
  )
}

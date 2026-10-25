import {
  Agreement01Icon,
  AirplaneTakeOff01Icon,
  ArrowDataTransferHorizontalIcon,
  Atm01Icon,
  BabyBottleIcon,
  BankIcon,
  BoneIcon,
  Briefcase01Icon,
  Bus01Icon,
  Car01Icon,
  CharityIcon,
  CloudIcon,
  CodeIcon,
  Coffee01Icon,
  CourtHouseIcon,
  CroissantIcon,
  CustomerService01Icon,
  DeliveryBox01Icon,
  DrinkIcon,
  Dumbbell01Icon,
  Exchange01Icon,
  Film01Icon,
  FuelStationIcon,
  GameController01Icon,
  GiftIcon,
  Home01Icon,
  Hotel01Icon,
  Invoice01Icon,
  Key01Icon,
  LaptopIcon,
  Luggage01Icon,
  Medicine01Icon,
  MoneyBag01Icon,
  MoneyReceive01Icon,
  MortarboardIcon,
  News01Icon,
  ParkingAreaSquareIcon,
  PercentCircleIcon,
  PlugSocketIcon,
  RepeatIcon,
  Restaurant01Icon,
  Road01Icon,
  ScissorIcon,
  Shield01Icon,
  ShoppingBag01Icon,
  ShoppingBasket01Icon,
  SmartPhone01Icon,
  StethoscopeIcon,
  Store01Icon,
  Tag01Icon,
  TaxesIcon,
  TaxiIcon,
  Ticket01Icon,
  Train01Icon,
  Tv01Icon,
  UserGroupIcon,
  Wrench01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { dash, plural } from '../core/format'
import type { CategoryIcon } from '../data/categories'
import type { Assignment } from '../data/ledger'
import type { MerchantKind } from '../data/merchants'
import type { CategoryType } from '../data/schema'
import { Copy } from '../ui/copy'
import type { Hue } from '../ui/hues'
import { Icon } from '../ui/icon'
import { Notice } from '../ui/notice'
import { Scan } from '../ui/scan'
import { root } from './-data'
import { dismiss, useDismissal } from './-notice'

export const icons: Record<CategoryIcon, IconSvgElement> = {
  basket: ShoppingBasket01Icon,
  restaurant: Restaurant01Icon,
  home: Home01Icon,
  plug: PlugSocketIcon,
  bus: Bus01Icon,
  plane: AirplaneTakeOff01Icon,
  bag: ShoppingBag01Icon,
  medicine: Medicine01Icon,
  scissor: ScissorIcon,
  ticket: Ticket01Icon,
  cloud: CloudIcon,
  cap: MortarboardIcon,
  shield: Shield01Icon,
  taxes: TaxesIcon,
  invoice: Invoice01Icon,
  gift: GiftIcon,
  atm: Atm01Icon,
  briefcase: Briefcase01Icon,
  receive: MoneyReceive01Icon,
  transfer: ArrowDataTransferHorizontalIcon,
  coffee: Coffee01Icon,
  car: Car01Icon,
  fuel: FuelStationIcon,
  phone: SmartPhone01Icon,
  pet: BoneIcon,
  baby: BabyBottleIcon,
  people: UserGroupIcon,
  bank: BankIcon,
  repeat: RepeatIcon,
  tag: Tag01Icon,
  laptop: LaptopIcon,
  percent: PercentCircleIcon,
  key: Key01Icon,
  handshake: Agreement01Icon,
}

export const hues: Record<CategoryIcon, Hue> = {
  basket: 'lime',
  restaurant: 'orange',
  home: 'indigo',
  plug: 'amber',
  bus: 'blue',
  plane: 'teal',
  bag: 'yellow',
  medicine: 'red',
  scissor: 'mint',
  ticket: 'pink',
  cloud: 'purple',
  cap: 'brown',
  shield: 'gray',
  taxes: 'gray',
  invoice: 'gray',
  gift: 'rose',
  atm: 'green',
  briefcase: 'green',
  receive: 'green',
  transfer: 'brass',
  coffee: 'orange',
  car: 'cyan',
  fuel: 'cyan',
  phone: 'amber',
  pet: 'brown',
  baby: 'rose',
  people: 'pink',
  bank: 'gray',
  repeat: 'purple',
  tag: 'gray',
  laptop: 'mint',
  percent: 'teal',
  key: 'lime',
  handshake: 'brass',
}

export const typeGroups: Record<CategoryType, string> = {
  expense: 'Expenses',
  income: 'Income',
  transfer: 'Transfers',
}

export const typeLabels: Record<CategoryType, string> = {
  expense: 'Expense',
  income: 'Income',
  transfer: 'Transfer',
}

export const kindIcons: Record<MerchantKind, IconSvgElement> = {
  supermarket: ShoppingBasket01Icon,
  bakery: CroissantIcon,
  restaurant: Restaurant01Icon,
  cafe: Coffee01Icon,
  bar: DrinkIcon,
  delivery: DeliveryBox01Icon,
  shop: ShoppingBag01Icon,
  marketplace: Store01Icon,
  pharmacy: Medicine01Icon,
  clinic: StethoscopeIcon,
  gym: Dumbbell01Icon,
  salon: ScissorIcon,
  fuel: FuelStationIcon,
  parking: ParkingAreaSquareIcon,
  toll: Road01Icon,
  transit: Train01Icon,
  taxi: TaxiIcon,
  airline: AirplaneTakeOff01Icon,
  hotel: Hotel01Icon,
  travel: Luggage01Icon,
  garage: Wrench01Icon,
  cinema: Film01Icon,
  streaming: Tv01Icon,
  games: GameController01Icon,
  venue: Ticket01Icon,
  media: News01Icon,
  software: CodeIcon,
  telecom: SmartPhone01Icon,
  utility: PlugSocketIcon,
  insurer: Shield01Icon,
  bank: BankIcon,
  exchange: Exchange01Icon,
  lender: MoneyBag01Icon,
  employer: Briefcase01Icon,
  government: CourtHouseIcon,
  school: MortarboardIcon,
  charity: CharityIcon,
  services: CustomerService01Icon,
}

export const kindLabel = (kind: MerchantKind) => kind.charAt(0).toUpperCase() + kind.slice(1)

export const prompt = 'Categorize my movements in Garner until its categorize tool says done.'

export function useCategorizeNotice() {
  const { pending } = root.useLoaderData()
  const dismissal = useDismissal('categorize')
  if (!pending || dismissal.state === 'closed') return undefined
  return (
    <Notice
      lead={<Scan />}
      title={`Let your AI app categorize ${plural(pending, 'movement')}`}
      text="Copy the prompt, paste it into Claude or ChatGPT, done."
      action={<Copy text={prompt} label="Copy prompt" variant="secondary" />}
      onClose={() => dismiss('categorize', pending)}
    />
  )
}

type AssignedProps = { assignment: Assignment; plain?: boolean }

export function Assigned({ assignment, plain }: AssignedProps) {
  const { categories } = root.useLoaderData()
  if (assignment.state === 'open') return dash
  if (assignment.state === 'unsure') return <span className="text-dim">Unsure</span>
  const category = categories.find(({ id }) => id === assignment.categoryId)
  if (!category) return dash
  const ai = assignment.state === 'ruled' && assignment.source === 'ai'
  return (
    <Link
      to="/categories/$categoryId"
      params={{ categoryId: category.id }}
      className={`inline-flex items-center gap-1.5 align-top transition ${ai ? 'text-dim hover:text-ink' : 'hover:text-dim'}`}
    >
      {!plain && <Icon icon={icons[category.icon]} />}
      {category.name}
    </Link>
  )
}

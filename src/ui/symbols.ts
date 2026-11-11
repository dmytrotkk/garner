import {
  Add01Icon,
  ArrowDataTransferHorizontalIcon,
  ArrowTurnBackwardIcon,
  Bookmark01Icon,
  BookmarkOff01Icon,
  Cancel01Icon,
  Copy01Icon,
  Delete02Icon,
  FileImportIcon,
  Note01Icon,
  PencilEdit01Icon,
  ShopSignIcon,
  Tag01Icon,
} from '@hugeicons/core-free-icons'
import type { IconSvgElement } from './icon.tsx'

export const symbols = {
  plus: Add01Icon,
  'square.and.arrow.down': FileImportIcon,
  pencil: PencilEdit01Icon,
  trash: Delete02Icon,
  'document.on.document': Copy01Icon,
  tag: Tag01Icon,
  storefront: ShopSignIcon,
  'text.pad.header': Note01Icon,
  'arrow.left.arrow.right': ArrowDataTransferHorizontalIcon,
  xmark: Cancel01Icon,
  'arrow.uturn.backward': ArrowTurnBackwardIcon,
  bookmark: Bookmark01Icon,
  'bookmark.slash': BookmarkOff01Icon,
} satisfies Record<string, IconSvgElement>

export type SymbolName = keyof typeof symbols

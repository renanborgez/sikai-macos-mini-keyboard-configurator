import type { LayoutId, Protocol } from './types'

export interface LayoutDef {
  id: LayoutId
  name: string
  rows: number
  cols: number
  knobs: number
}

/**
 * Keyboard models known to exist with this firmware family
 * (see the photo list in kriomant/ch57x-keyboard-tool).
 */
export const LAYOUTS: LayoutDef[] = [
  { id: '15-3', name: '15 keys · 3 knobs', rows: 3, cols: 5, knobs: 3 },
  { id: '12-4', name: '12 keys · 4 knobs', rows: 3, cols: 4, knobs: 4 },
  { id: '12-3', name: '12 keys · 3 knobs', rows: 3, cols: 4, knobs: 3 },
  { id: '12-2', name: '12 keys · 2 knobs', rows: 3, cols: 4, knobs: 2 },
  { id: '9-2', name: '9 keys · 2 knobs', rows: 3, cols: 3, knobs: 2 },
  { id: '6-1', name: '6 keys · 1 knob', rows: 2, cols: 3, knobs: 1 },
  { id: '4-0', name: '4 keys · no knob', rows: 1, cols: 4, knobs: 0 },
  { id: '3-1', name: '3 keys · 1 knob', rows: 1, cols: 3, knobs: 1 }
]

export const DEFAULT_LAYOUT: LayoutId = '15-3'

export function getLayout(id: LayoutId | string | undefined): LayoutDef {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0]
}

export const keyCount = (l: LayoutDef) => l.rows * l.cols

/**
 * One-row keyboards with a single knob only accept modifiers on the first step of a sequence
 * (documented limitation of these boards).
 */
export const isLimited = (l: LayoutDef) => (l.rows === 1 || l.cols === 1) && l.knobs === 1

export interface ProtocolCaps {
  maxSteps: number
  delay: boolean
  led: boolean
  maxKeys: number
  maxKnobs: number
}

export const CAPS: Record<Protocol, ProtocolCaps> = {
  '884x': { maxSteps: 18, delay: true, led: true, maxKeys: 15, maxKnobs: 4 },
  '8890': { maxSteps: 5, delay: false, led: false, maxKeys: 12, maxKnobs: 3 }
}

export function layoutSupported(l: LayoutDef, p: Protocol): boolean {
  const caps = CAPS[p]
  if (keyCount(l) > caps.maxKeys || l.knobs > caps.maxKnobs) return false
  // 884x: a 4th knob replaces the 13th–15th key ids, so 4 knobs means at most 12 keys.
  if (p === '884x' && l.knobs === 4 && keyCount(l) > 12) return false
  return true
}

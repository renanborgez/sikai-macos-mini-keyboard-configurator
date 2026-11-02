/** Storage size of a profile layer: the largest supported layouts (15 keys, or 4 knobs). */
export const MAX_KEYS = 15
export const MAX_KNOBS = 4
export const NUM_LAYERS = 3

/** Wire protocol family, decided by the connected device's USB ID. */
export type Protocol = '884x' | '8890'

export type LayoutId = '15-3' | '12-4' | '12-3' | '12-2' | '9-2' | '6-1' | '4-0' | '3-1'
export type KnobSide = 'left' | 'right'

/** Modifier bitmask (HID standard). On a Mac, "win" is ⌘ and "alt" is ⌥. */
export const Mod = {
  ctrl: 0x01,
  shift: 0x02,
  alt: 0x04,
  cmd: 0x08,
  rctrl: 0x10,
  rshift: 0x20,
  ralt: 0x40,
  rcmd: 0x80
} as const

/** One chord: modifiers held + optional key (HID keyboard usage). */
export interface Step {
  mods: number
  code: number // 0 = modifier only
}

export type MouseButtonMask = number // left 1, right 2, middle 4

export type Action =
  | { type: 'none' }
  | { type: 'keys'; steps: Step[]; delay?: number }
  | { type: 'media'; code: number }
  | { type: 'click'; buttons: MouseButtonMask; mods?: number }
  | { type: 'wheel'; delta: number; mods?: number }

export type KnobPart = 'ccw' | 'press' | 'cw'

export interface Knob {
  ccw: Action
  press: Action
  cw: Action
}

export type LedMode = 'off' | 'backlight' | 'shock' | 'shock2' | 'press'
export const LED_COLORS = ['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'] as const
export type LedColor = (typeof LED_COLORS)[number]

export interface Led {
  mode: LedMode
  color: LedColor
}

export interface Layer {
  keys: Action[]
  knobs: Knob[]
  led: Led
}

export interface Profile {
  version: 1
  /** Physical model of the keyboard (number of keys / knobs). */
  layout: LayoutId
  /** Which side of the keyboard the knobs are on (drawing only). */
  knobSide: KnobSide
  layers: Layer[]
}

export type Target = { kind: 'key'; index: number } | { kind: 'knob'; index: number; part: KnobPart }

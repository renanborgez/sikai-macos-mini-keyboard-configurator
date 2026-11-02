import { Action, Knob, LED_COLORS, Layer, Led, LedColor, LedMode, Mod, NUM_KEYS, NUM_KNOBS, NUM_LAYERS, Profile } from './types'
import { MAX_DELAY, MAX_STEPS } from './protocol'

const none: Action = { type: 'none' }
const cmd = (code: number, extra = 0): Action => ({ type: 'keys', steps: [{ mods: Mod.cmd | extra, code }] })
const media = (code: number): Action => ({ type: 'media', code })

function emptyLayer(): Layer {
  return {
    keys: Array.from({ length: NUM_KEYS }, () => ({ ...none })),
    knobs: Array.from({ length: NUM_KNOBS }, (): Knob => ({ ccw: none, press: none, cw: none })),
    led: { mode: 'backlight', color: 'white' }
  }
}

/** Sensible Mac defaults for layer 1; layers 2 and 3 start empty. */
export function defaultProfile(): Profile {
  const layers = Array.from({ length: NUM_LAYERS }, emptyLayer)
  const l = layers[0]
  // Row 1: copy, paste, cut, undo, redo
  l.keys[0] = cmd(0x06) // ⌘C
  l.keys[1] = cmd(0x19) // ⌘V
  l.keys[2] = cmd(0x1b) // ⌘X
  l.keys[3] = cmd(0x1d) // ⌘Z
  l.keys[4] = cmd(0x1d, Mod.shift) // ⌘⇧Z
  // Row 2: select all, save, find, new tab, close tab
  l.keys[5] = cmd(0x04)
  l.keys[6] = cmd(0x16)
  l.keys[7] = cmd(0x09)
  l.keys[8] = cmd(0x17)
  l.keys[9] = cmd(0x1a)
  // Row 3: screenshot area, spotlight, prev, play, next
  l.keys[10] = cmd(0x21, Mod.shift) // ⌘⇧4
  l.keys[11] = cmd(0x2c) // ⌘Space
  l.keys[12] = media(0xb6)
  l.keys[13] = media(0xcd)
  l.keys[14] = media(0xb5)
  // Big knob: volume, small knobs: brightness / scroll
  l.knobs[0] = { ccw: media(0xea), press: media(0xe2), cw: media(0xe9) }
  l.knobs[1] = { ccw: media(0x70), press: none, cw: media(0x6f) }
  l.knobs[2] = { ccw: { type: 'wheel', delta: -1 }, press: none, cw: { type: 'wheel', delta: 1 } }
  return { version: 1, layers }
}

const LED_MODES: LedMode[] = ['off', 'backlight', 'shock', 'shock2', 'press']
const int = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.trunc(v))) : fallback

/** Validate one action from untrusted JSON; anything malformed becomes "none". */
export function sanitizeAction(raw: unknown): Action {
  const a = raw as Record<string, unknown> | null
  if (!a || typeof a !== 'object') return { type: 'none' }
  switch (a.type) {
    case 'keys': {
      const steps = Array.isArray(a.steps) ? a.steps : []
      return {
        type: 'keys',
        steps: steps.slice(0, MAX_STEPS).map((s: { mods?: unknown; code?: unknown }) => ({
          mods: int(s?.mods, 0, 0xff, 0),
          code: int(s?.code, 0, 0xff, 0)
        })),
        delay: int(a.delay, 0, MAX_DELAY, 0)
      }
    }
    case 'media':
      return { type: 'media', code: int(a.code, 0, 0xffff, 0xe9) }
    case 'click':
      return { type: 'click', buttons: int(a.buttons, 1, 7, 1), mods: int(a.mods, 0, 7, 0) }
    case 'wheel':
      return { type: 'wheel', delta: int(a.delta, -127, 127, 1), mods: int(a.mods, 0, 7, 0) }
    default:
      return { type: 'none' }
  }
}

/** White only exists as a backlight color; other modes fall back to red. */
export function sanitizeLed(raw: unknown): Led {
  const l = raw as Partial<Led> | null
  const mode = LED_MODES.includes(l?.mode as LedMode) ? (l!.mode as LedMode) : 'backlight'
  let color: LedColor = LED_COLORS.includes(l?.color as LedColor) ? (l!.color as LedColor) : 'white'
  if (color === 'white' && mode !== 'backlight' && mode !== 'off') color = 'red'
  return { mode, color }
}

/** Fill in anything missing from a loaded/imported profile and drop invalid values. */
export function normalizeProfile(raw: unknown): Profile {
  const base = defaultProfile()
  const p = raw as { layers?: unknown } | null
  if (!p || typeof p !== 'object' || !Array.isArray(p.layers)) return base
  const srcLayers = p.layers as unknown[]
  base.layers = base.layers.map((_, l) => {
    const src = srcLayers[l] as { keys?: unknown[]; knobs?: Record<string, unknown>[]; led?: unknown } | undefined
    if (!src || typeof src !== 'object') return emptyLayer()
    const keys = Array.isArray(src.keys) ? src.keys : []
    const knobs = Array.isArray(src.knobs) ? src.knobs : []
    return {
      keys: Array.from({ length: NUM_KEYS }, (_, i) => sanitizeAction(keys[i])),
      knobs: Array.from({ length: NUM_KNOBS }, (_, i) => ({
        ccw: sanitizeAction(knobs[i]?.ccw),
        press: sanitizeAction(knobs[i]?.press),
        cw: sanitizeAction(knobs[i]?.cw)
      })),
      led: sanitizeLed(src.led)
    }
  })
  return base
}

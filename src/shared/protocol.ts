/**
 * Wire protocol for 1189:8840 / 1189:8842 mini keyboards (CH57x "884x" firmware).
 * Ported from kriomant/ch57x-keyboard-tool (src/keyboard/k884x.rs).
 *
 * Every message is a 64-byte HID output report whose first byte is report ID 0x03.
 */
import { Action, Led, LedColor, NUM_KEYS, NUM_KNOBS, NUM_LAYERS, Profile, Target } from './types'

export const REPORT_SIZE = 64
export const VENDOR_ID = 0x1189
export const SUPPORTED_PRODUCT_IDS = [0x8840, 0x8842]
export const MAX_STEPS = 18
export const MAX_DELAY = 6000

const KNOB_PART_OFFSET = { ccw: 0, press: 1, cw: 2 } as const

export function message(bytes: number[]): Uint8Array {
  if (bytes.length > REPORT_SIZE) throw new Error('message too long')
  const buf = new Uint8Array(REPORT_SIZE)
  buf.set(bytes.map((b) => b & 0xff))
  return buf
}

export function targetId(t: Target): number {
  if (t.kind === 'key') {
    if (t.index < 0 || t.index >= NUM_KEYS) throw new Error(`invalid key index ${t.index}`)
    return t.index + 1
  }
  if (t.index < 0 || t.index >= NUM_KNOBS) throw new Error(`invalid knob index ${t.index}`)
  return NUM_KEYS + 1 + 3 * t.index + KNOB_PART_OFFSET[t.part]
}

function actionKind(a: Action): number {
  switch (a.type) {
    case 'keys':
    case 'none':
      return 1
    case 'media':
      return 2
    case 'click':
    case 'wheel':
      return 3
  }
}

const COMMIT = [message([0x03, 0xaa, 0xaa]), message([0x03, 0xfd, 0xfe, 0xff]), message([0x03, 0xaa, 0xaa])]

export function encodeBinding(layer: number, target: Target, action: Action): Uint8Array[] {
  if (layer < 0 || layer >= NUM_LAYERS) throw new Error('invalid layer')
  const id = targetId(target)
  const head = [0x03, 0xfe, id, layer + 1, actionKind(action), 0, 0, 0, 0, 0]
  const out: Uint8Array[] = []

  switch (action.type) {
    case 'none':
      // Empty keyboard macro: the key sends nothing.
      out.push(message([...head, 0]))
      break
    case 'keys': {
      const steps = action.steps
      if (steps.length > MAX_STEPS) throw new Error(`at most ${MAX_STEPS} steps per key`)
      // A single modifier-only step uses count 0 so it combines with other keys.
      const count = steps.length === 1 && steps[0].code === 0 ? 0 : steps.length
      const body = steps.flatMap((s) => [s.mods, s.code])
      out.push(message([...head, count, ...body]))
      const delay = action.delay ?? 0
      if (delay > 0) {
        if (delay > MAX_DELAY) throw new Error(`maximum delay is ${MAX_DELAY}ms`)
        out.push(message([0x03, 0xfe, id, layer + 1, 0x05, delay & 0xff, delay >> 8]))
      }
      break
    }
    case 'media':
      out.push(message([...head, 0, action.code & 0xff, (action.code >> 8) & 0xff]))
      break
    case 'click':
      if (!action.buttons) throw new Error('click needs at least one mouse button')
      out.push(message([...head, 0x01, action.mods ?? 0, action.buttons]))
      break
    case 'wheel':
      out.push(message([...head, 0x03, action.mods ?? 0, 0, 0, 0, action.delta]))
      break
  }
  out.push(...COMMIT)
  return out
}

export function ledCode(led: Led): number {
  const color = colorIndex(led.color)
  switch (led.mode) {
    case 'off':
      return 0
    case 'backlight':
      return color === 0 ? 0x05 : (color << 4) | 1
    case 'shock':
      return (Math.max(color, 1) << 4) | 2
    case 'shock2':
      return (Math.max(color, 1) << 4) | 3
    case 'press':
      return (Math.max(color, 1) << 4) | 4
  }
}

function colorIndex(c: LedColor): number {
  return ['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'].indexOf(c)
}

export function encodeLed(layer: number, led: Led): Uint8Array[] {
  return [
    message([0x03, 0xfe, 0xb0, layer + 1, 0x08, 0, 0, 0, 0, 0, 0x01, 0x00, ledCode(led)]),
    message([0x03, 0xfd, 0xfe, 0xff])
  ]
}

/** Every message needed to write a full profile to the device. */
export function encodeProfile(p: Profile, opts: { led?: boolean } = {}): Uint8Array[] {
  const out: Uint8Array[] = []
  p.layers.forEach((layer, l) => {
    layer.keys.forEach((a, i) => out.push(...encodeBinding(l, { kind: 'key', index: i }, a)))
    layer.knobs.forEach((k, i) => {
      for (const part of ['ccw', 'press', 'cw'] as const)
        out.push(...encodeBinding(l, { kind: 'knob', index: i, part }, k[part]))
    })
    if (opts.led !== false) out.push(...encodeLed(l, layer.led))
  })
  return out
}

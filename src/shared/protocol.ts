/**
 * Wire protocols for CH57x-based "MINI KeyBoard" macro pads.
 * Ported from kriomant/ch57x-keyboard-tool (src/keyboard/k884x.rs and k8890.rs).
 *
 * Every message is a 64-byte HID output report whose first byte is report ID 0x03.
 */
import { CAPS, LayoutDef, getLayout, isLimited, keyCount, layoutSupported } from './layouts'
import { Action, Led, LedColor, NUM_LAYERS, Profile, Protocol, Target } from './types'

export const REPORT_SIZE = 64
export const MAX_STEPS = 18 // largest across protocols; see CAPS for per-protocol limits
export const MAX_DELAY = 6000

/** Known devices. The same USB ID can't be told apart further, so the user picks the layout. */
export const DEVICES: { vendorId: number; productId: number; protocol: Protocol }[] = [
  { vendorId: 0x1189, productId: 0x8840, protocol: '884x' },
  { vendorId: 0x1189, productId: 0x8842, protocol: '884x' },
  { vendorId: 0x1189, productId: 0x8850, protocol: '884x' },
  { vendorId: 0x514c, productId: 0x8851, protocol: '884x' },
  { vendorId: 0x1189, productId: 0x8890, protocol: '8890' }
]
/** Vendor IDs used by this family (for "found but unsupported" detection). */
export const FAMILY_VENDOR_IDS = [0x1189, 0x514c]

export function protocolFor(vendorId: number, productId: number): Protocol | undefined {
  return DEVICES.find((d) => d.vendorId === vendorId && d.productId === productId)?.protocol
}

const PART = { ccw: 0, press: 1, cw: 2 } as const

export function message(bytes: number[]): Uint8Array {
  if (bytes.length > REPORT_SIZE) throw new Error('message too long')
  const buf = new Uint8Array(REPORT_SIZE)
  buf.set(bytes.map((b) => b & 0xff))
  return buf
}

export function targetName(t: Target): string {
  if (t.kind === 'key') return `Key ${t.index + 1}`
  return `Knob ${t.index + 1} (${{ ccw: 'turn left', press: 'press', cw: 'turn right' }[t.part]})`
}

/** Device-side id of a key or knob action. */
export function targetId(protocol: Protocol, layout: LayoutDef, t: Target): number {
  if (t.kind === 'key') {
    if (t.index < 0 || t.index >= keyCount(layout)) throw new Error(`${targetName(t)} doesn't exist on this model`)
    return t.index + 1
  }
  if (t.index < 0 || t.index >= layout.knobs) throw new Error(`${targetName(t)} doesn't exist on this model`)
  const part = PART[t.part]
  if (protocol === '8890') return 13 + 3 * t.index + part
  // 884x: knobs 1–3 use 16+; on 12-key / 4-knob boards the 4th knob takes the ids of keys 13–15.
  if (t.index === 3) return 13 + part
  return 16 + 3 * t.index + part
}

function kindOf(a: Action): number {
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

function checkAction(protocol: Protocol, layout: LayoutDef, a: Action) {
  if (a.type === 'click' && !a.buttons) throw new Error('mouse click needs at least one button')
  if (a.type !== 'keys') return
  const caps = CAPS[protocol]
  if (a.steps.length > caps.maxSteps) throw new Error(`at most ${caps.maxSteps} keys per sequence on this keyboard`)
  // Chips without delay support simply don't get the delay message (the editor warns about it).
  if (caps.delay && (a.delay ?? 0) > MAX_DELAY) throw new Error(`maximum delay is ${MAX_DELAY} ms`)
  if (isLimited(layout) && a.steps.slice(1).some((s) => s.mods !== 0))
    throw new Error('this model only supports modifiers (⌘⌥⌃⇧) on the first key of a sequence')
}

const COMMIT_884X = [message([0x03, 0xaa, 0xaa]), message([0x03, 0xfd, 0xfe, 0xff]), message([0x03, 0xaa, 0xaa])]

function encode884x(layer: number, id: number, action: Action): Uint8Array[] {
  const L = layer + 1
  const head = [0x03, 0xfe, id, L, kindOf(action), 0, 0, 0, 0, 0]
  const out: Uint8Array[] = []
  switch (action.type) {
    case 'none':
      out.push(message([...head, 0]))
      break
    case 'keys': {
      const steps = action.steps
      // A single modifier-only step uses count 0 so it combines with other keys.
      const count = steps.length === 1 && steps[0].code === 0 ? 0 : steps.length
      out.push(message([...head, count, ...steps.flatMap((s) => [s.mods, s.code])]))
      const delay = action.delay ?? 0
      if (delay > 0) out.push(message([0x03, 0xfe, id, L, 0x05, delay & 0xff, delay >> 8]))
      break
    }
    case 'media':
      out.push(message([...head, 0, action.code & 0xff, (action.code >> 8) & 0xff]))
      break
    case 'click':
      out.push(message([...head, 0x01, action.mods ?? 0, action.buttons]))
      break
    case 'wheel':
      out.push(message([...head, 0x03, action.mods ?? 0, 0, 0, 0, action.delta]))
      break
  }
  out.push(...COMMIT_884X)
  return out
}

function encode8890(layer: number, id: number, action: Action): Uint8Array[] {
  const L = layer + 1
  const tag = (L << 4) | kindOf(action)
  const out: Uint8Array[] = [message([0x03, 0xfe, L, 0x01, 0x01])]
  switch (action.type) {
    case 'none':
    case 'keys': {
      const steps = action.type === 'keys' ? action.steps : []
      // The firmware expects an empty chord before the real ones.
      const chords = [{ mods: 0, code: 0 }, ...steps]
      chords.forEach((s, i) => out.push(message([0x03, id, tag, steps.length, i, s.mods, s.code])))
      break
    }
    case 'media':
      out.push(message([0x03, id, tag, action.code & 0xff, (action.code >> 8) & 0xff]))
      break
    case 'click':
      out.push(message([0x03, id, tag, action.buttons, 0, 0, 0, action.mods ?? 0]))
      break
    case 'wheel':
      out.push(message([0x03, id, tag, 0, 0, 0, action.delta, action.mods ?? 0]))
      break
  }
  out.push(message([0x03, 0xaa, 0xaa]))
  return out
}

export function encodeBinding(
  protocol: Protocol,
  layout: LayoutDef,
  layer: number,
  target: Target,
  action: Action
): Uint8Array[] {
  if (layer < 0 || layer >= NUM_LAYERS) throw new Error('invalid layer')
  const id = targetId(protocol, layout, target)
  try {
    checkAction(protocol, layout, action)
  } catch (e) {
    throw new Error(`Layer ${layer + 1}, ${targetName(target)}: ${(e as Error).message}`)
  }
  return protocol === '8890' ? encode8890(layer, id, action) : encode884x(layer, id, action)
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
  return Math.max(0, ['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple'].indexOf(c))
}

/** LED settings (884x only). */
export function encodeLed(layer: number, led: Led): Uint8Array[] {
  return [
    message([0x03, 0xfe, 0xb0, layer + 1, 0x08, 0, 0, 0, 0, 0, 0x01, 0x00, ledCode(led)]),
    message([0x03, 0xfd, 0xfe, 0xff])
  ]
}

/** Every message needed to write a full profile to a device speaking `protocol`. */
export function encodeProfile(p: Profile, protocol: Protocol): Uint8Array[] {
  const layout = getLayout(p.layout)
  if (!layoutSupported(layout, protocol))
    throw new Error(`The "${layout.name}" model isn't supported by this keyboard's chip. Pick your model in the top bar.`)
  const out: Uint8Array[] = []
  p.layers.forEach((layer, l) => {
    for (let i = 0; i < keyCount(layout); i++)
      out.push(...encodeBinding(protocol, layout, l, { kind: 'key', index: i }, layer.keys[i]))
    for (let k = 0; k < layout.knobs; k++)
      for (const part of ['ccw', 'press', 'cw'] as const)
        out.push(...encodeBinding(protocol, layout, l, { kind: 'knob', index: k, part }, layer.knobs[k][part]))
    if (CAPS[protocol].led) out.push(...encodeLed(l, layer.led))
  })
  return out
}

import { Action, Mod, Step } from './types'

/** HID keyboard usage → label, plus the browser KeyboardEvent.code that produces it. */
interface KeyDef {
  usage: number
  label: string
  code: string
}

const defs: KeyDef[] = []
const add = (usage: number, label: string, code: string) => defs.push({ usage, label, code })

'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => add(0x04 + i, c, `Key${c}`))
'1234567890'.split('').forEach((c, i) => add(0x1e + i, c, `Digit${c}`))
add(0x28, '↩', 'Enter')
add(0x29, 'Esc', 'Escape')
add(0x2a, '⌫', 'Backspace')
add(0x2b, '⇥', 'Tab')
add(0x2c, 'Space', 'Space')
add(0x2d, '-', 'Minus')
add(0x2e, '=', 'Equal')
add(0x2f, '[', 'BracketLeft')
add(0x30, ']', 'BracketRight')
add(0x31, '\\', 'Backslash')
add(0x33, ';', 'Semicolon')
add(0x34, "'", 'Quote')
add(0x35, '`', 'Backquote')
add(0x36, ',', 'Comma')
add(0x37, '.', 'Period')
add(0x38, '/', 'Slash')
add(0x39, 'Caps', 'CapsLock')
for (let i = 1; i <= 12; i++) add(0x3a + i - 1, `F${i}`, `F${i}`)
for (let i = 13; i <= 24; i++) add(0x68 + i - 13, `F${i}`, `F${i}`)
add(0x46, 'PrtSc', 'PrintScreen')
add(0x47, 'ScrLk', 'ScrollLock')
add(0x48, 'Pause', 'Pause')
add(0x49, 'Ins', 'Insert')
add(0x4a, 'Home', 'Home')
add(0x4b, 'PgUp', 'PageUp')
add(0x4c, '⌦', 'Delete')
add(0x4d, 'End', 'End')
add(0x4e, 'PgDn', 'PageDown')
add(0x4f, '→', 'ArrowRight')
add(0x50, '←', 'ArrowLeft')
add(0x51, '↓', 'ArrowDown')
add(0x52, '↑', 'ArrowUp')
add(0x54, 'Num/', 'NumpadDivide')
add(0x55, 'Num*', 'NumpadMultiply')
add(0x56, 'Num-', 'NumpadSubtract')
add(0x57, 'Num+', 'NumpadAdd')
add(0x58, 'NumEnter', 'NumpadEnter')
'1234567890'.split('').forEach((c, i) => add(0x59 + i, `Num${c}`, `Numpad${c}`))
add(0x63, 'Num.', 'NumpadDecimal')

export const KEYS = defs
const byUsage = new Map(defs.map((d) => [d.usage, d]))
const byCode = new Map(defs.map((d) => [d.code, d]))

export function usageFromCode(code: string): number | undefined {
  return byCode.get(code)?.usage
}

export function keyLabel(usage: number): string {
  return byUsage.get(usage)?.label ?? `0x${usage.toString(16)}`
}

/** Modifier bit for a browser modifier KeyboardEvent.code, if any. */
export const MODIFIER_CODES: Record<string, number> = {
  ControlLeft: Mod.ctrl,
  ShiftLeft: Mod.shift,
  AltLeft: Mod.alt,
  MetaLeft: Mod.cmd,
  ControlRight: Mod.rctrl,
  ShiftRight: Mod.rshift,
  AltRight: Mod.ralt,
  MetaRight: Mod.rcmd
}

export function modsLabel(mods: number): string {
  let s = ''
  if (mods & (Mod.ctrl | Mod.rctrl)) s += '⌃'
  if (mods & (Mod.alt | Mod.ralt)) s += '⌥'
  if (mods & (Mod.shift | Mod.rshift)) s += '⇧'
  if (mods & (Mod.cmd | Mod.rcmd)) s += '⌘'
  return s
}

export function stepLabel(s: Step): string {
  return modsLabel(s.mods) + (s.code ? keyLabel(s.code) : '')
}

/** Consumer-control (media) usages supported by the firmware. */
export const MEDIA: { code: number; label: string }[] = [
  { code: 0xe9, label: 'Volume up' },
  { code: 0xea, label: 'Volume down' },
  { code: 0xe2, label: 'Mute' },
  { code: 0xcd, label: 'Play / Pause' },
  { code: 0xb5, label: 'Next track' },
  { code: 0xb6, label: 'Previous track' },
  { code: 0xb7, label: 'Stop' },
  { code: 0x6f, label: 'Brighter' },
  { code: 0x70, label: 'Dimmer' },
  { code: 0x192, label: 'Calculator' },
  { code: 0x224, label: 'Browser back' },
  { code: 0x225, label: 'Browser forward' },
  { code: 0x223, label: 'Browser home' }
]

export function mediaLabel(code: number): string {
  return MEDIA.find((m) => m.code === code)?.label ?? `Media 0x${code.toString(16)}`
}

export function actionLabel(a: Action): string {
  switch (a.type) {
    case 'none':
      return ''
    case 'keys':
      return a.steps.map(stepLabel).join(' ')
    case 'media':
      return mediaLabel(a.code)
    case 'click':
      return [a.buttons & 1 && 'L', a.buttons & 2 && 'R', a.buttons & 4 && 'M'].filter(Boolean).join('+') + ' click'
    case 'wheel':
      return `Scroll ${a.delta > 0 ? '↑' : '↓'}${Math.abs(a.delta)}`
  }
}

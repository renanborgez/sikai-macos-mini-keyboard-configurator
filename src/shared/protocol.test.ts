import { describe, expect, it } from 'vitest'
import { encodeBinding, encodeLed, encodeProfile, ledCode, protocolFor, targetId } from './protocol'
import { LAYOUTS, getLayout, layoutSupported } from './layouts'
import { defaultProfile } from './profile'
import { Mod } from './types'

/** Strip zero padding so messages compare like the reference tool's test vectors. */
const hex = (msgs: Uint8Array[]) =>
  msgs.map((m) => {
    let end = m.length
    while (end > 0 && m[end - 1] === 0) end--
    return Array.from(m.slice(0, end))
  })

const L15 = getLayout('15-3')
const L12_4 = getLayout('12-4')
const L3_1 = getLayout('3-1')
const commit884x = [[0x03, 0xaa, 0xaa], [0x03, 0xfd, 0xfe, 0xff], [0x03, 0xaa, 0xaa]]

describe('device table', () => {
  it('maps USB ids to protocols', () => {
    expect(protocolFor(0x1189, 0x8840)).toBe('884x')
    expect(protocolFor(0x1189, 0x8842)).toBe('884x')
    expect(protocolFor(0x1189, 0x8890)).toBe('8890')
    expect(protocolFor(0x514c, 0x8850)).toBeUndefined() // 4x4 variant, different protocol
  })

  it('knows which layouts each chip supports', () => {
    expect(layoutSupported(L15, '884x')).toBe(true)
    expect(layoutSupported(L15, '8890')).toBe(false) // 8890 tops out at 12 keys
    expect(layoutSupported(L12_4, '8890')).toBe(false) // and 3 knobs
    expect(layoutSupported(L3_1, '8890')).toBe(true)
  })
})

describe('884x protocol (vectors from ch57x-keyboard-tool)', () => {
  it('every message is 64 bytes', () => {
    for (const m of encodeProfile(defaultProfile(), '884x')) expect(m.length).toBe(64)
  })

  it('maps targets to ids', () => {
    expect(targetId('884x', L15, { kind: 'key', index: 0 })).toBe(1)
    expect(targetId('884x', L15, { kind: 'key', index: 14 })).toBe(15)
    expect(targetId('884x', L15, { kind: 'knob', index: 0, part: 'ccw' })).toBe(16)
    expect(targetId('884x', L15, { kind: 'knob', index: 0, part: 'press' })).toBe(17)
    expect(targetId('884x', L15, { kind: 'knob', index: 0, part: 'cw' })).toBe(18)
    expect(targetId('884x', L15, { kind: 'knob', index: 2, part: 'cw' })).toBe(24)
    expect(() => targetId('884x', L15, { kind: 'key', index: 15 })).toThrow()
    expect(() => targetId('884x', L15, { kind: 'knob', index: 3, part: 'cw' })).toThrow()
  })

  it('4th knob on 12-key boards uses the ids of keys 13–15', () => {
    expect(targetId('884x', L12_4, { kind: 'knob', index: 3, part: 'ccw' })).toBe(13)
    expect(targetId('884x', L12_4, { kind: 'knob', index: 3, part: 'cw' })).toBe(15)
    expect(() => targetId('884x', L12_4, { kind: 'key', index: 12 })).toThrow()
  })

  it('encodes ctrl-a with delay 1000', () => {
    const out = encodeBinding('884x', L15, 0, { kind: 'key', index: 0 }, {
      type: 'keys',
      steps: [{ mods: Mod.ctrl, code: 0x04 }],
      delay: 1000
    })
    expect(hex(out)).toEqual([
      [0x03, 0xfe, 0x01, 0x01, 0x01, 0, 0, 0, 0, 0, 0x01, 0x01, 0x04],
      [0x03, 0xfe, 0x01, 0x01, 0x05, 0xe8, 0x03],
      ...commit884x
    ])
  })

  it('encodes a plain key without delay as 4 messages', () => {
    const out = encodeBinding('884x', L15, 0, { kind: 'key', index: 0 }, { type: 'keys', steps: [{ mods: 0, code: 0x04 }] })
    expect(out.length).toBe(4)
  })

  it('encodes a lone modifier with count 0', () => {
    const out = encodeBinding('884x', L15, 1, { kind: 'key', index: 2 }, { type: 'keys', steps: [{ mods: Mod.cmd, code: 0 }] })
    expect(hex(out)[0]).toEqual([0x03, 0xfe, 0x03, 0x02, 0x01, 0, 0, 0, 0, 0, 0x00, 0x08])
  })

  it('encodes media keys', () => {
    const out = encodeBinding('884x', L15, 0, { kind: 'knob', index: 0, part: 'cw' }, { type: 'media', code: 0xe9 })
    expect(hex(out)[0]).toEqual([0x03, 0xfe, 18, 0x01, 0x02, 0, 0, 0, 0, 0, 0, 0xe9])
  })

  it('encodes LED backlight cyan', () => {
    expect(hex(encodeLed(0, { mode: 'backlight', color: 'cyan' }))).toEqual([
      [0x03, 0xfe, 0xb0, 0x01, 0x08, 0, 0, 0, 0, 0, 0x01, 0x00, 0x51],
      [0x03, 0xfd, 0xfe, 0xff]
    ])
  })

  it('LED codes match reference', () => {
    expect(ledCode({ mode: 'off', color: 'red' })).toBe(0x00)
    expect(ledCode({ mode: 'backlight', color: 'white' })).toBe(0x05)
    expect(ledCode({ mode: 'backlight', color: 'red' })).toBe(0x11)
    expect(ledCode({ mode: 'backlight', color: 'blue' })).toBe(0x61)
    expect(ledCode({ mode: 'shock', color: 'red' })).toBe(0x12)
    expect(ledCode({ mode: 'shock2', color: 'green' })).toBe(0x43)
    expect(ledCode({ mode: 'press', color: 'purple' })).toBe(0x74)
  })

  it('rejects delays over 6000ms and names the key', () => {
    expect(() =>
      encodeBinding('884x', L15, 1, { kind: 'key', index: 4 }, { type: 'keys', steps: [{ mods: 0, code: 4 }], delay: 6001 })
    ).toThrow(/Layer 2, Key 5/)
  })
})

describe('8890 protocol (vectors from ch57x-keyboard-tool)', () => {
  const L12 = getLayout('12-3')

  it('encodes ctrl-a', () => {
    const out = encodeBinding('8890', L12, 0, { kind: 'key', index: 0 }, { type: 'keys', steps: [{ mods: Mod.ctrl, code: 0x04 }] })
    expect(hex(out)).toEqual([
      [0x03, 0xfe, 0x01, 0x01, 0x01],
      [0x03, 0x01, 0x11, 0x01],
      [0x03, 0x01, 0x11, 0x01, 0x01, 0x01, 0x04],
      [0x03, 0xaa, 0xaa]
    ])
  })

  it('encodes media', () => {
    const out = encodeBinding('8890', L12, 0, { kind: 'key', index: 1 }, { type: 'media', code: 0xe9 })
    expect(hex(out)).toEqual([[0x03, 0xfe, 0x01, 0x01, 0x01], [0x03, 0x02, 0x12, 0xe9], [0x03, 0xaa, 0xaa]])
  })

  it('encodes mouse click', () => {
    const out = encodeBinding('8890', L12, 0, { kind: 'key', index: 2 }, { type: 'click', buttons: 1 })
    expect(hex(out)).toEqual([[0x03, 0xfe, 0x01, 0x01, 0x01], [0x03, 0x03, 0x13, 0x01], [0x03, 0xaa, 0xaa]])
  })

  it('uses layer in the start message and tag', () => {
    const out = encodeBinding('8890', L12, 2, { kind: 'knob', index: 0, part: 'cw' }, { type: 'media', code: 0xe9 })
    expect(hex(out)[0]).toEqual([0x03, 0xfe, 0x03, 0x01, 0x01])
    expect(hex(out)[1]).toEqual([0x03, 15, 0x32, 0xe9])
  })

  it('limits sequences to 5 keys', () => {
    const steps = Array(6).fill({ mods: 0, code: 4 })
    expect(() => encodeBinding('8890', L12, 0, { kind: 'key', index: 0 }, { type: 'keys', steps })).toThrow(/at most 5/)
  })

  it('skips LEDs and refuses unsupported layouts', () => {
    const p = { ...defaultProfile(), layout: '12-3' as const }
    const msgs = encodeProfile(p, '8890')
    expect(msgs.some((m) => m[1] === 0xfe && m[2] === 0xb0)).toBe(false)
    expect(() => encodeProfile(defaultProfile(), '8890')).toThrow(/isn't supported/)
  })
})

describe('layouts', () => {
  it('3 keys + 1 knob only allows modifiers on the first step', () => {
    const ok = { type: 'keys' as const, steps: [{ mods: Mod.cmd, code: 4 }, { mods: 0, code: 5 }] }
    const bad = { type: 'keys' as const, steps: [{ mods: 0, code: 4 }, { mods: Mod.cmd, code: 5 }] }
    expect(() => encodeBinding('884x', L3_1, 0, { kind: 'key', index: 0 }, ok)).not.toThrow()
    expect(() => encodeBinding('884x', L3_1, 0, { kind: 'key', index: 0 }, bad)).toThrow(/first key/)
  })

  it('every layout the 884x chip supports encodes a full default profile', () => {
    for (const l of LAYOUTS.filter((x) => layoutSupported(x, '884x'))) {
      expect(() => encodeProfile({ ...defaultProfile(), layout: l.id }, '884x')).not.toThrow()
    }
  })

  it('writes only the keys and knobs the model has', () => {
    const p = { ...defaultProfile(), layout: '3-1' as const }
    const ids = new Set(encodeProfile(p, '884x').filter((m) => m[1] === 0xfe && m[2] !== 0xb0).map((m) => m[2]))
    expect([...ids].sort((a, b) => a - b)).toEqual([1, 2, 3, 16, 17, 18])
  })
})

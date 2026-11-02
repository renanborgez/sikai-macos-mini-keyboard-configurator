import { describe, expect, it } from 'vitest'
import { encodeBinding, encodeLed, encodeProfile, ledCode, targetId } from './protocol'
import { defaultProfile } from './profile'
import { Mod } from './types'

const hex = (msgs: Uint8Array[]) =>
  msgs.map((m) => {
    let end = m.length
    while (end > 0 && m[end - 1] === 0) end--
    return Array.from(m.slice(0, end))
  })

const commit = [[0x03, 0xaa, 0xaa], [0x03, 0xfd, 0xfe, 0xff], [0x03, 0xaa, 0xaa]]

describe('884x protocol (vectors from ch57x-keyboard-tool)', () => {
  it('every message is 64 bytes', () => {
    for (const m of encodeProfile(defaultProfile())) expect(m.length).toBe(64)
  })

  it('maps targets to ids', () => {
    expect(targetId({ kind: 'key', index: 0 })).toBe(1)
    expect(targetId({ kind: 'key', index: 14 })).toBe(15)
    expect(targetId({ kind: 'knob', index: 0, part: 'ccw' })).toBe(16)
    expect(targetId({ kind: 'knob', index: 0, part: 'press' })).toBe(17)
    expect(targetId({ kind: 'knob', index: 0, part: 'cw' })).toBe(18)
    expect(targetId({ kind: 'knob', index: 2, part: 'cw' })).toBe(24)
    expect(() => targetId({ kind: 'key', index: 15 })).toThrow()
  })

  it('encodes ctrl-a with delay 1000', () => {
    const out = encodeBinding(0, { kind: 'key', index: 0 }, {
      type: 'keys',
      steps: [{ mods: Mod.ctrl, code: 0x04 }],
      delay: 1000
    })
    expect(hex(out)).toEqual([
      [0x03, 0xfe, 0x01, 0x01, 0x01, 0, 0, 0, 0, 0, 0x01, 0x01, 0x04],
      [0x03, 0xfe, 0x01, 0x01, 0x05, 0xe8, 0x03],
      ...commit
    ])
  })

  it('encodes a plain key without delay as 4 messages', () => {
    const out = encodeBinding(0, { kind: 'key', index: 0 }, { type: 'keys', steps: [{ mods: 0, code: 0x04 }] })
    expect(out.length).toBe(4)
  })

  it('encodes a lone modifier with count 0', () => {
    const out = encodeBinding(1, { kind: 'key', index: 2 }, { type: 'keys', steps: [{ mods: Mod.cmd, code: 0 }] })
    expect(hex(out)[0]).toEqual([0x03, 0xfe, 0x03, 0x02, 0x01, 0, 0, 0, 0, 0, 0x00, 0x08])
  })

  it('encodes media keys', () => {
    const out = encodeBinding(0, { kind: 'knob', index: 0, part: 'cw' }, { type: 'media', code: 0xe9 })
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

  it('rejects delays over 6000ms', () => {
    expect(() =>
      encodeBinding(0, { kind: 'key', index: 0 }, { type: 'keys', steps: [{ mods: 0, code: 4 }], delay: 6001 })
    ).toThrow()
  })
})

import { describe, expect, it } from 'vitest'
import { defaultProfile, normalizeProfile, sanitizeAction, sanitizeLed } from './profile'
import { encodeProfile } from './protocol'
import { NUM_KEYS, NUM_KNOBS, NUM_LAYERS } from './types'

describe('profile validation', () => {
  it('round-trips the default profile unchanged', () => {
    const p = defaultProfile()
    expect(normalizeProfile(JSON.parse(JSON.stringify(p)))).toEqual(normalizeProfile(p))
  })

  it('returns defaults for garbage input', () => {
    for (const raw of [null, undefined, 42, 'x', {}, { layers: 'nope' }]) {
      const p = normalizeProfile(raw)
      expect(p.layers).toHaveLength(NUM_LAYERS)
    }
  })

  it('always yields full-size layers that encode without throwing', () => {
    const p = normalizeProfile({
      layers: [
        {
          keys: [{ type: 'keys' }, { type: 'keys', steps: [{ mods: 999, code: -5 }], delay: 99999 }, { type: 'bogus' }],
          knobs: [{ ccw: { type: 'media', code: 'x' } }],
          led: { mode: 'press', color: 'white' }
        },
        'not a layer'
      ]
    })
    for (const l of p.layers) {
      expect(l.keys).toHaveLength(NUM_KEYS)
      expect(l.knobs).toHaveLength(NUM_KNOBS)
    }
    expect(() => encodeProfile(p)).not.toThrow()
  })

  it('clamps action values into protocol ranges', () => {
    expect(sanitizeAction({ type: 'keys', steps: [{ mods: 999, code: -5 }], delay: 99999 })).toEqual({
      type: 'keys',
      steps: [{ mods: 255, code: 0 }],
      delay: 6000
    })
    expect(sanitizeAction({ type: 'keys', steps: Array(30).fill({ mods: 0, code: 4 }) })).toMatchObject({
      steps: expect.any(Array)
    })
    expect((sanitizeAction({ type: 'keys', steps: Array(30).fill({ mods: 0, code: 4 }) }) as { steps: unknown[] }).steps).toHaveLength(18)
    expect(sanitizeAction({ type: 'wheel', delta: -500 })).toMatchObject({ delta: -127 })
    expect(sanitizeAction({ type: 'click', buttons: 0 })).toMatchObject({ buttons: 1 })
    expect(sanitizeAction({ type: 'nope' })).toEqual({ type: 'none' })
  })

  it('never sends white for non-backlight LED modes', () => {
    expect(sanitizeLed({ mode: 'press', color: 'white' })).toEqual({ mode: 'press', color: 'red' })
    expect(sanitizeLed({ mode: 'backlight', color: 'white' })).toEqual({ mode: 'backlight', color: 'white' })
    expect(sanitizeLed({ mode: 'party', color: 'pink' })).toEqual({ mode: 'backlight', color: 'white' })
  })
})

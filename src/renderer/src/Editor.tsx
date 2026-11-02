import { useEffect, useRef, useState } from 'react'
import { KEYS, MEDIA, MODIFIER_CODES, stepLabel, usageFromCode } from '../../shared/keycodes'
import { MAX_DELAY } from '../../shared/protocol'
import { Action, KnobPart, Mod, Step, Target } from '../../shared/types'

interface Props {
  target: Target
  action: Action
  onChange: (a: Action) => void
  onTest: () => void
  canTest: boolean
  /** For knobs: the three actions shown as tabs. */
  parts?: { part: KnobPart; title: string; summary: string }[]
  onPart?: (p: KnobPart) => void
  /** Limits of the connected keyboard's chip. */
  maxSteps: number
  allowDelay: boolean
  /** One-row + one-knob boards only take modifiers on the first step. */
  limited: boolean
}

const TYPES: { id: Action['type']; label: string }[] = [
  { id: 'keys', label: 'Shortcut' },
  { id: 'media', label: 'Media' },
  { id: 'click', label: 'Mouse click' },
  { id: 'wheel', label: 'Scroll' },
  { id: 'none', label: 'Nothing' }
]

function defaultFor(type: Action['type']): Action {
  switch (type) {
    case 'keys':
      return { type, steps: [] }
    case 'media':
      return { type, code: 0xe9 }
    case 'click':
      return { type, buttons: 1 }
    case 'wheel':
      return { type, delta: 1 }
    default:
      return { type: 'none' }
  }
}

export default function Editor({ target, action, onChange, onTest, canTest, parts, onPart, maxSteps, allowDelay, limited }: Props) {
  return (
    <div className="editor">
      <div className="editor-head">
        <h2>{target.kind === 'key' ? `Key ${target.index + 1}` : `Knob ${target.index + 1}`}</h2>
        {parts && target.kind === 'knob' && (
          <div className="parts">
            {parts.map((p) => (
              <button key={p.part} className={target.part === p.part ? 'on' : ''} onClick={() => onPart?.(p.part)}>
                <span className="part-title">{p.title}</span>
                <span className="part-sum">{p.summary || 'not set'}</span>
              </button>
            ))}
          </div>
        )}
        <button className="ghost small send-one" disabled={!canTest} onClick={onTest} title="Write only this action to the keyboard">
          Send just this one
        </button>
      </div>
      <div className="seg">
        {TYPES.map((t) => (
          <button
            key={t.id}
            className={action.type === t.id ? 'on' : ''}
            onClick={() => action.type !== t.id && onChange(defaultFor(t.id))}
          >
            {t.label}
          </button>
        ))}
      </div>

      {action.type === 'keys' && (
        <ShortcutEditor action={action} onChange={onChange} maxSteps={maxSteps} allowDelay={allowDelay} limited={limited} />
      )}

      {action.type === 'media' && (
        <div className="grid-choices">
          {MEDIA.map((m) => (
            <button key={m.code} className={action.code === m.code ? 'on' : ''} onClick={() => onChange({ ...action, code: m.code })}>
              {m.label}
            </button>
          ))}
        </div>
      )}

      {action.type === 'click' && (
        <div className="row">
          {[
            [1, 'Left'],
            [2, 'Right'],
            [4, 'Middle']
          ].map(([bit, name]) => (
            <label key={bit} className="check">
              <input
                type="checkbox"
                checked={!!(action.buttons & (bit as number))}
                onChange={(e) =>
                  onChange({ ...action, buttons: e.target.checked ? action.buttons | (bit as number) : action.buttons & ~(bit as number) })
                }
              />
              {name}
            </label>
          ))}
        </div>
      )}

      {action.type === 'wheel' && (
        <div className="row">
          <label>
            Amount&nbsp;
            <input
              type="number"
              min={-127}
              max={127}
              value={action.delta}
              onChange={(e) => onChange({ ...action, delta: Math.max(-127, Math.min(127, Number(e.target.value) || 0)) })}
            />
          </label>
          <span className="hint">positive = up, negative = down</span>
        </div>
      )}

    </div>
  )
}

function ShortcutEditor({
  action,
  onChange,
  maxSteps,
  allowDelay,
  limited
}: {
  action: Extract<Action, { type: 'keys' }>
  onChange: (a: Action) => void
  maxSteps: number
  allowDelay: boolean
  limited: boolean
}) {
  const [recording, setRecording] = useState(false)
  const held = useRef(0)
  const usedKey = useRef(false)
  const stepsRef = useRef(action.steps)
  stepsRef.current = action.steps
  const actionRef = useRef(action)
  actionRef.current = action

  const push = (s: Step) => {
    if (stepsRef.current.length >= maxSteps) return
    const next = [...stepsRef.current, s]
    stepsRef.current = next
    onChange({ ...actionRef.current, steps: next })
  }

  useEffect(() => {
    if (!recording) return
    window.miniKey.setRecording(true)
    held.current = 0
    usedKey.current = false
    const off = window.miniKey.onRecorderKey((k) => {
      const modBit = MODIFIER_CODES[k.code]
      if (k.type === 'keyDown') {
        if (k.repeat) return
        if (modBit) {
          held.current |= modBit
          return
        }
        const usage = usageFromCode(k.code)
        if (usage) {
          usedKey.current = true
          push({ mods: held.current, code: usage })
        }
      } else if (modBit) {
        // Modifier released without any other key → record a modifier-only step.
        if (!usedKey.current && held.current) push({ mods: held.current, code: 0 })
        held.current &= ~modBit
        if (!held.current) usedKey.current = false
      }
    })
    return () => {
      off()
      window.miniKey.setRecording(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording])

  const [mods, setMods] = useState(0)
  const [code, setCode] = useState(0x04)

  return (
    <div className="shortcut">
      <div className={`recorder${recording ? ' rec' : ''}`} onClick={() => !recording && setRecording(true)}>
        <div className="steps">
          {action.steps.length === 0 && (
            <span className="placeholder">{recording ? 'Press your shortcut now…' : 'Click here, then press the shortcut'}</span>
          )}
          {action.steps.map((s, i) => (
            <span
              key={i}
              className="chip"
              onClick={(e) => {
                e.stopPropagation()
                onChange({ ...action, steps: action.steps.filter((_, j) => j !== i) })
              }}
              title="Click to remove"
            >
              {stepLabel(s)}
            </span>
          ))}
          {recording && <span className="rec-dot">● recording</span>}
        </div>
        <div className="recorder-actions" onClick={(e) => e.stopPropagation()}>
          {recording ? (
            <button className="danger" onClick={() => setRecording(false)}>
              Done
            </button>
          ) : (
            <button className="primary" onClick={() => setRecording(true)}>
              Record
            </button>
          )}
          <button className="ghost" onClick={() => onChange({ ...action, steps: [] })} disabled={!action.steps.length}>
            Clear
          </button>
        </div>
      </div>

      <div className="shortcut-extra">
        <div className="manual">
          <span className="manual-label">Add manually</span>
          {(
            [
              [Mod.ctrl, '⌃'],
              [Mod.alt, '⌥'],
              [Mod.shift, '⇧'],
              [Mod.cmd, '⌘']
            ] as const
          ).map(([bit, g]) => (
            <button key={bit} className={`mod${mods & bit ? ' on' : ''}`} onClick={() => setMods(mods ^ bit)}>
              {g}
            </button>
          ))}
          <select value={code} onChange={(e) => setCode(Number(e.target.value))}>
            <option value={0}>(modifier only)</option>
            {KEYS.map((k) => (
              <option key={k.usage} value={k.usage}>
                {k.label}
              </option>
            ))}
          </select>
          <button className="ghost" onClick={() => push({ mods, code })} disabled={!mods && !code}>
            Add
          </button>
        </div>
        {allowDelay && (
        <label className="delay">
          Delay
          <input
            type="number"
            min={0}
            max={MAX_DELAY}
            step={50}
            value={action.delay ?? 0}
            onChange={(e) => onChange({ ...action, delay: Math.max(0, Math.min(MAX_DELAY, Number(e.target.value) || 0)) })}
          />
          ms
        </label>
        )}
      </div>
      <p className="hint">
        Hold modifiers for a combo (⌘⇧4). Press several keys to type them in sequence (max {maxSteps}). Click a chip to remove it.
        Use “Add manually” for shortcuts macOS grabs first, like ⌘Space.
      </p>
      {limited && action.steps.slice(1).some((s) => s.mods) && (
        <p className="hint warn">This model only supports modifiers (⌘⌥⌃⇧) on the first key of a sequence.</p>
      )}
      {action.steps.length > maxSteps && (
        <p className="hint warn">This keyboard supports at most {maxSteps} keys per sequence — remove some.</p>
      )}
      {!allowDelay && (action.delay ?? 0) > 0 && (
        <p className="hint warn">This keyboard doesn’t support delays; it will be ignored.</p>
      )}
    </div>
  )
}

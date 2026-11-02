import { useEffect, useRef, useState } from 'react'
import Pad from './Pad'
import logo from './assets/logo.svg'
import Editor from './Editor'
import { targetName } from '../../shared/protocol'
import { CAPS, LAYOUTS, getLayout, isLimited, keyCount, layoutSupported } from '../../shared/layouts'
import { defaultProfile, sanitizeLed } from '../../shared/profile'
import { actionLabel } from '../../shared/keycodes'
import { Action, KnobPart, LED_COLORS, LayoutId, Led, LedMode, NUM_LAYERS, Profile, Target } from '../../shared/types'
import type { DeviceStatus } from '../../main/hid'

const LED_MODES: { id: LedMode; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'backlight', label: 'Always on' },
  { id: 'press', label: 'Light on press' },
  { id: 'shock', label: 'Shock' },
  { id: 'shock2', label: 'Shock 2' }
]

/** Screenshot mode (see MINIKEY_SNAPSHOT in main): never writes the saved profile. */
const SNAPSHOT = new URLSearchParams(location.search).has('snapshot')

type Toast = { kind: 'ok' | 'err'; text: string } | null

function getAction(p: Profile, layer: number, t: Target): Action {
  const l = p.layers[layer]
  return t.kind === 'key' ? l.keys[t.index] : l.knobs[t.index][t.part]
}

function setAction(p: Profile, layer: number, t: Target, a: Action): Profile {
  const layers = p.layers.map((l, i) => {
    if (i !== layer) return l
    if (t.kind === 'key') return { ...l, keys: l.keys.map((k, j) => (j === t.index ? a : k)) }
    return { ...l, knobs: l.knobs.map((k, j) => (j === t.index ? { ...k, [t.part]: a } : k)) }
  })
  return { ...p, layers }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [layer, setLayer] = useState(0)
  const [selected, setSelected] = useState<Target | null>(null)
  const [status, setStatus] = useState<DeviceStatus>({ state: 'missing' })
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<Toast>(null)
  const loaded = useRef(false)
  const uploading = useRef(false)

  // Load saved profile
  useEffect(() => {
    window.miniKey.loadProfile().then((p) => {
      if (SNAPSHOT) {
        const q = new URLSearchParams(location.search)
        const base = q.get('defaults') ? defaultProfile() : (p ?? defaultProfile())
        setProfile({ ...base, layout: getLayout(q.get('layout') || base.layout).id, knobSide: q.get('side') === 'right' ? 'right' : base.knobSide })
        return
      }
      setProfile(p ?? defaultProfile())
      setDirty(!p)
      loaded.current = true
    })
    // Ignore progress events that arrive after an upload has finished.
    return window.miniKey.onProgress((p) => uploading.current && setProgress(p))
  }, [])

  // Autosave locally
  useEffect(() => {
    if (!profile || !loaded.current || SNAPSHOT) return
    const t = setTimeout(() => window.miniKey.saveProfile(profile).catch((e) => console.error('autosave failed', e)), 300)
    return () => clearTimeout(t)
  }, [profile])

  // Poll connection
  useEffect(() => {
    const tick = () => window.miniKey.status().then(setStatus).catch(() => setStatus({ state: 'missing' }))
    tick()
    const id = setInterval(tick, 1500)
    return () => clearInterval(id)
  }, [])

  // Esc clears the selection. (While recording a shortcut, keys go to the recorder instead.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  if (!profile) return null

  const connected = status.state === 'connected'
  const busy = progress !== null
  const update = (p: Profile) => {
    setProfile(p)
    setDirty(true)
  }
  const fail = (e: unknown) => setToast({ kind: 'err', text: String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') })

  const uploadAll = async () => {
    uploading.current = true
    setProgress({ done: 0, total: 1 })
    try {
      await window.miniKey.upload(profile)
      setDirty(false)
      setToast({ kind: 'ok', text: 'Keyboard updated — all 3 layers written.' })
    } catch (e) {
      fail(e)
    } finally {
      uploading.current = false
      setProgress(null)
    }
  }

  const sendOne = async () => {
    if (!selected) return
    try {
      await window.miniKey.uploadOne(profile.layout, layer, selected, getAction(profile, layer, selected))
      setToast({ kind: 'ok', text: `Sent ${targetName(selected)} (layer ${layer + 1}).` })
    } catch (e) {
      fail(e)
    }
  }

  const led = profile.layers[layer].led
  const setLed = (raw: Led) => {
    const l = sanitizeLed(raw)
    update({ ...profile, layers: profile.layers.map((x, i) => (i === layer ? { ...x, led: l } : x)) })
  }

  const layout = getLayout(profile.layout)
  const protocol = status.state === 'connected' ? status.protocol : undefined
  // Without a keyboard plugged in, allow everything the most capable chip allows.
  const caps = CAPS[protocol ?? '884x']
  const setLayout = (id: LayoutId) => {
    const next = getLayout(id)
    // Drop a selection that doesn't exist on the new model.
    if (selected && (selected.kind === 'key' ? selected.index >= keyCount(next) : selected.index >= next.knobs)) setSelected(null)
    update({ ...profile, layout: id })
  }

  const sel = selected
  const knob = sel?.kind === 'knob' ? profile.layers[layer].knobs[sel.index] : null
  const parts: { part: KnobPart; title: string; summary: string }[] | undefined = knob
    ? [
        { part: 'ccw', title: '⟲ Turn left', summary: actionLabel(knob.ccw) },
        { part: 'press', title: 'Press', summary: actionLabel(knob.press) },
        { part: 'cw', title: 'Turn right ⟳', summary: actionLabel(knob.cw) }
      ]
    : undefined

  return (
    <div
      className="app"
      onMouseDown={(e) => {
        // Clicking empty space outside the keyboard (and outside the editor/controls) clears the selection.
        const el = e.target as HTMLElement
        if (!el.closest('.pad, .dock, button, select, input, label')) setSelected(null)
      }}
    >
      <header className="titlebar">
        <div className="brand">
          <img src={logo} alt="" />
          Mini Key
        </div>
        <div className="model">
          <select
            value={profile.layout}
            onChange={(e) => setLayout(e.target.value as LayoutId)}
            title="Your keyboard's model"
          >
            {LAYOUTS.map((l) => (
              <option key={l.id} value={l.id} disabled={!!protocol && !layoutSupported(l, protocol)}>
                {l.name}
              </option>
            ))}
          </select>
          {layout.knobs > 0 && (
            <button
              className="ghost small mirror"
              title="Knobs on the other side"
              onClick={() => update({ ...profile, knobSide: profile.knobSide === 'left' ? 'right' : 'left' })}
            >
              ⇆
            </button>
          )}
        </div>
        <div className={`status ${status.state}`}>
          <span className="dot" />
          {status.state === 'connected' && (protocol && !layoutSupported(layout, protocol)
            ? 'Connected — this chip doesn’t support the selected model'
            : 'Keyboard connected')}
          {status.state === 'missing' && 'Plug in the keyboard with USB'}
          {status.state === 'unsupported' && status.message}
        </div>
        <div className="head-actions">
          <div className="profile-menu">
            <button className="ghost small" onClick={() => window.miniKey.importProfile().then((p) => p && update(p)).catch(fail)}>
              Import
            </button>
            <button className="ghost small" onClick={() => window.miniKey.exportProfile(profile).catch(fail)}>
              Export
            </button>
            <button
              className="ghost small"
              onClick={() => {
                update(defaultProfile())
                setToast({ kind: 'ok', text: 'Reset to defaults — upload to apply.' })
              }}
            >
              Reset
            </button>
          </div>
          <button className={`primary upload-btn${dirty ? ' dirty' : ''}`} disabled={!connected || busy} onClick={uploadAll}>
            {busy ? (
              <span className="progress">
                <span style={{ width: `${(100 * progress!.done) / progress!.total}%` }} />
              </span>
            ) : (
              'Upload to keyboard'
            )}
          </button>
        </div>
      </header>

      <main className="stage">
        <div className="stage-bar">
          <div className="layers">
            {Array.from({ length: NUM_LAYERS }, (_, i) => (
              <button key={i} className={i === layer ? 'on' : ''} onClick={() => setLayer(i)}>
                Layer {i + 1}
              </button>
            ))}
          </div>
          {caps.led && (
            <div className="led">
              <span className="led-label">Lights</span>
              <select value={led.mode} onChange={(e) => setLed({ ...led, mode: e.target.value as LedMode })}>
                {LED_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
              {led.mode !== 'off' && (
                <div className="swatches">
                  {LED_COLORS.filter((c) => c !== 'white' || led.mode === 'backlight').map((c) => (
                    <button key={c} className={`swatch ${c}${led.color === c ? ' on' : ''}`} onClick={() => setLed({ ...led, color: c })} title={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Pad layout={layout} knobSide={profile.knobSide} layer={profile.layers[layer]} selected={selected} onSelect={setSelected} />

        <div className="stage-note">
          {toast ? (
            <span className={`toast ${toast.kind}`}>{toast.text}</span>
          ) : dirty ? (
            <span className="unsaved">You have changes that aren’t on the keyboard yet</span>
          ) : (
            <span>Layer {layer + 1} = position {layer + 1} of the layer switch on the keyboard</span>
          )}
        </div>
      </main>

      <section className="dock">
        {selected ? (
          <Editor
            key={`${layer}:${selected.kind}:${selected.index}:${selected.kind === 'knob' ? selected.part : ''}`}
            target={selected}
            action={getAction(profile, layer, selected)}
            onChange={(a) => update(setAction(profile, layer, selected, a))}
            onTest={sendOne}
            canTest={connected && !busy}
            parts={parts}
            onPart={(part) => selected.kind === 'knob' && setSelected({ ...selected, part })}
            maxSteps={caps.maxSteps}
            allowDelay={caps.delay}
            limited={isLimited(layout)}
          />
        ) : (
          <div className="dock-empty">
            <div className="dock-empty-title">Nothing selected</div>
            <div>Click a key or a knob on the keyboard above to change what it does.</div>
          </div>
        )}
      </section>
    </div>
  )
}

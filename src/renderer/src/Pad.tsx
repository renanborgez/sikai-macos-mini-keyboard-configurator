import { actionLabel } from '../../shared/keycodes'
import { LayoutDef, keyCount } from '../../shared/layouts'
import type { KnobSide, Layer, Target } from '../../shared/types'

interface Props {
  layout: LayoutDef
  knobSide: KnobSide
  layer: Layer
  selected: Target | null
  onSelect: (t: Target) => void
}

function Dial({
  index,
  size,
  layer,
  selected,
  onSelect
}: { index: number; size: 'big' | 'small' } & Pick<Props, 'layer' | 'selected' | 'onSelect'>) {
  const knob = layer.knobs[index]
  const active = selected?.kind === 'knob' && selected.index === index
  const ccw = actionLabel(knob.ccw)
  const cw = actionLabel(knob.cw)
  const press = actionLabel(knob.press)
  return (
    <button
      className={`dial-wrap ${size}${active ? ' active' : ''}`}
      onClick={() => onSelect({ kind: 'knob', index, part: selected?.kind === 'knob' && active ? selected.part : 'ccw' })}
    >
      <span className="dial">
        <span className="dial-mark" />
      </span>
      <span className="dial-caption">
        <span className="dial-name">Knob {index + 1}</span>
        {ccw || cw || press ? (
          <>
            <span className="dial-sum">⟲ {ccw || '—'}</span>
            <span className="dial-sum">⟳ {cw || '—'}</span>
          </>
        ) : (
          <span className="dial-sum">not set</span>
        )}
      </span>
    </button>
  )
}

export default function Pad({ layout, knobSide, layer, selected, onSelect }: Props) {
  const knobs = layout.knobs
  // Single-row boards are short: draw their knob at the small size so the body stays compact.
  const bigFirst = layout.rows > 1
  return (
    <div
      className={`pad knobs-${knobSide}${knobs === 0 ? ' no-knobs' : ''}`}
      data-layout={layout.id}
    >
      {knobs > 0 && (
        <div className={`pad-knobs count-${knobs}`}>
          {bigFirst && <Dial index={0} size="big" layer={layer} selected={selected} onSelect={onSelect} />}
          <div className="pad-small">
            {Array.from({ length: knobs }, (_, k) => k)
              .filter((k) => !bigFirst || k > 0)
              .map((k) => (
                <Dial key={k} index={k} size="small" layer={layer} selected={selected} onSelect={onSelect} />
              ))}
          </div>
        </div>
      )}
      <div className="pad-keys" style={{ gridTemplateColumns: `repeat(${layout.cols}, 84px)`, gridTemplateRows: `repeat(${layout.rows}, 84px)` }}>
        {Array.from({ length: keyCount(layout) }, (_, i) => {
          const a = layer.keys[i]
          const text = actionLabel(a)
          const active = selected?.kind === 'key' && selected.index === i
          return (
            <button
              key={i}
              className={`cap${active ? ' active' : ''}${text ? '' : ' empty'}`}
              onClick={() => onSelect({ kind: 'key', index: i })}
            >
              <span className="cap-text">{text || '+'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

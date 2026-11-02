import { actionLabel } from '../../shared/keycodes'
import type { Layer, Target } from '../../shared/types'

interface Props {
  layer: Layer
  selected: Target | null
  onSelect: (t: Target) => void
}

function Dial({ index, size, layer, selected, onSelect }: { index: number; size: 'big' | 'small' } & Props) {
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

export default function Pad(props: Props) {
  const { layer, selected, onSelect } = props
  return (
    <div className="pad">
      <div className="pad-knobs">
        <Dial index={0} size="big" {...props} />
        <div className="pad-small">
          <Dial index={1} size="small" {...props} />
          <Dial index={2} size="small" {...props} />
        </div>
      </div>
      <div className="pad-keys">
        {layer.keys.map((a, i) => {
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

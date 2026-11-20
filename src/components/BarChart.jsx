import React from 'react'
import { fmtMoney } from '../lib/plan.js'

// Barras apiladas simples (cada barra: lista de segmentos con valor y color).
export function StackedBars({ rows, legend }) {
  const max = Math.max(...rows.map((r) => r.total), 1)
  return (
    <div>
      <div className="sbars">
        {rows.map((r) => (
          <div className="sbar" key={r.ym} title={`${r.label}: ${fmtMoney(r.total)}`}>
            <div className="sbar-col" style={{ height: `${Math.max(2, (r.total / max) * 100)}%` }}>
              {r.segments.map((s, i) => s.value > 0 && <i key={i} style={{ flex: s.value, background: s.color }} />)}
            </div>
            <span>{r.label}<br />{fmtMoney(r.total)}</span>
          </div>
        ))}
      </div>
      {legend && <div className="legend">{legend.map((l) => <span key={l.label}><b style={{ background: l.color }} />{l.label}</span>)}</div>}
    </div>
  )
}

export function HBars({ rows, color = 'var(--accent)' }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '.9em' }}><span>{r.label}</span><b>{fmtMoney(r.value)}{r.pct !== undefined ? ` · ${r.pct}%` : ''}</b></div>
          <div className="meter"><i style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} /></div>
        </div>
      ))}
    </div>
  )
}

import React from 'react'
import { utilZone } from '../lib/credit.js'

// Termómetro de utilización: velocímetro con zonas verde (<30 %), amarilla (30-50 %) y roja (>50 %).
const CX = 100
const CY = 100
const R = 80
const pt = (pct, r = R) => {
  const a = ((180 - 1.8 * Math.min(100, Math.max(0, pct))) * Math.PI) / 180
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)]
}
const arc = (a, b) => {
  const [x1, y1] = pt(a)
  const [x2, y2] = pt(b)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export default function CreditGauge({ pct, size = 220, title, sub }) {
  const p = Math.max(0, pct || 0)
  const zone = utilZone(p)
  const [nx, ny] = pt(p, R - 14)
  return (
    <figure className="gauge" style={{ width: size, maxWidth: '100%' }}>
      <svg viewBox="0 0 200 128" role="img" aria-label={`Utilización de crédito ${Math.round(p)} por ciento. ${zone.label}`}>
        <path d={arc(0, 30)} stroke="#16a34a" strokeWidth="14" fill="none" opacity=".9" />
        <path d={arc(30, 50)} stroke="#ca8a04" strokeWidth="14" fill="none" opacity=".9" />
        <path d={arc(50, 100)} stroke="#dc2626" strokeWidth="14" fill="none" opacity=".9" />
        <line x1={CX} y1={CY} x2={nx} y2={ny} stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r="6" fill="currentColor" />
        <text x="100" y="124" textAnchor="middle" fontSize="22" fontWeight="800" fill={zone.color}>{Math.round(p)}%</text>
      </svg>
      <figcaption>
        {title && <strong>{title}</strong>}
        <span style={{ color: zone.color, fontWeight: 600 }}>{zone.label}</span>
        {sub && <span className="muted">{sub}</span>}
      </figcaption>
    </figure>
  )
}

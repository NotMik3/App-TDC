import React, { useMemo, useState } from 'react'
import { HBars } from './BarChart.jsx'
import { categorize, merchantName, monthSpending, monthsWithMovements, ymOf } from '../lib/categories.js'
import { nowMonth } from '../lib/msi.js'
import { fmtMoney, fmtMonth } from '../lib/plan.js'

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null }

export default function Analytics({ data, setData }) {
  const months = monthsWithMovements(data)
  const [ym, setYm] = useState(months.includes(nowMonth()) ? nowMonth() : (months[0] || nowMonth()))
  const list = useMemo(() => (data.movements || []).filter((m) => ymOf(m.date) === ym && Number.isFinite(m.amount) && m.kind !== 'abono'), [data.movements, ym])
  const byCat = useMemo(() => {
    const t = new Map()
    for (const m of list) { const k = m.category || categorize(m.description, m.kind); t.set(k, (t.get(k) || 0) + m.amount) }
    const total = [...t.values()].reduce((a, v) => a + v, 0)
    return [...t.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value, pct: total > 0 ? Math.round((value / total) * 100) : 0 }))
  }, [list])
  const byMerchant = useMemo(() => {
    const t = new Map()
    for (const m of list.filter((x) => x.kind === 'cargo')) { const k = merchantName(m.description); const e = t.get(k) || { value: 0, n: 0 }; e.value += m.amount; e.n++; t.set(k, e) }
    return [...t.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8).map(([label, e]) => ({ label: `${label} (${e.n})`, value: e.value }))
  }, [list])
  const foreign = (data.movements || []).filter((m) => m.currency && m.currency !== 'MXN').sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 15)

  const cap = data.profile?.budgetCap || 0
  const spent = monthSpending(data, ym)
  const pct = cap > 0 ? (spent / cap) * 100 : 0
  const setCap = (v) => setData({ ...data, profile: { ...(data.profile || {}), budgetCap: num(v) || 0 } })

  return (
    <section>
      <h2 className="page-title">Análisis</h2>
      {months.length === 0 && <div className="card"><p className="muted">Aún no hay movimientos. Se llenan solos cuando subes estados de cuenta en PDF que traen su detalle de movimientos.</p></div>}
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Tope de presupuesto mensual</h3>
          <select value={ym} onChange={(e) => setYm(e.target.value)} style={{ width: 'auto' }}>
            {[...new Set([ym, ...months])].map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
        </div>
        <label>Mi tope de gasto al mes ($) — pon uno menor al límite de tu banco</label>
        <input inputMode="decimal" key={cap} defaultValue={cap || ''} placeholder="Ej. 15000" onBlur={(e) => setCap(e.target.value)} />
        {cap > 0 && (
          <>
            <div className={`meter${pct >= 100 ? ' red' : pct >= 80 ? ' amber' : ''}`} style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <p><b>{fmtMoney(spent)}</b> de {fmtMoney(cap)} ({Math.round(pct)} %){pct >= 100 ? ' — 🚨 superaste tu tope' : pct >= 80 ? ' — ⚠️ te acercas a tu tope' : ''}</p>
          </>
        )}
        <p className="muted">Cuenta tus cargos de tarjeta de crédito del mes (sin pagos, intereses ni comisiones).</p>
      </div>

      {byCat.length > 0 && (
        <div className="card"><h3>Gasto por categoría · {fmtMonth(ym)}</h3><HBars rows={byCat} /><p className="muted">Las categorías se asignan por palabras clave del comercio; «Otros» agrupa lo que no reconozco.</p></div>
      )}
      {byMerchant.length > 0 && <div className="card"><h3>Comercios principales</h3><HBars rows={byMerchant} color="#f59e0b" /></div>}

      {foreign.length > 0 && (
        <div className="card">
          <h3>Compras en otras divisas</h3>
          {foreign.map((m) => (
            <div key={m.id} className="list-row">
              <span>{m.date} · {m.description}</span>
              <span style={{ textAlign: 'right' }}>{m.original ? `${m.original.amount} ${m.original.currency}` : m.currency} → <b>{fmtMoney(m.amount)}</b> MXN</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

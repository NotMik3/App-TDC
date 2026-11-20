import React, { useState } from 'react'
import { StackedBars } from './BarChart.jsx'
import { activeMsi, msiEndMonth, projectCommitments } from '../lib/msi.js'
import { detectSubscriptions } from '../lib/subscriptions.js'
import { fmtMoney, fmtMonth } from '../lib/plan.js'

export default function MsiPanel({ data, setData }) {
  const [months, setMonths] = useState(12)
  const [pick, setPick] = useState('')
  const plans = activeMsi(data)
  const card = (id) => data.cards.find((c) => c.id === id)
  const label = (c) => c ? `${c.bank || 'Banco'} ····${c.last4 || '----'}` : 'Tarjeta'
  const monthlyNow = plans.reduce((a, p) => a + p.monthly, 0)
  const toPay = plans.reduce((a, p) => a + p.remaining, 0)
  const { subs, candidates, monthlyTotal, annualTotal } = detectSubscriptions(data)
  const proj = projectCommitments(data, months)
  const setOv = (key, v) => setData({ ...data, subOverrides: { ...(data.subOverrides || {}), [key]: v } })
  const removePlan = (id) => { if (confirm('¿Quitar este plan de MSI? (Se vuelve a crear si subes otro estado que lo incluya.)')) setData({ ...data, msi: data.msi.filter((p) => p.id !== id) }) }

  return (
    <section>
      <h2 className="page-title">MSI y suscripciones</h2>
      <div className="grid">
        <div className="card stat"><span>MSI activos</span><b>{plans.length}</b></div>
        <div className="card stat"><span>Pago mensual en MSI</span><b>{fmtMoney(monthlyNow)}</b></div>
        <div className="card stat"><span>Por liquidar en MSI</span><b>{fmtMoney(toPay)}</b></div>
        <div className="card stat"><span>Suscripciones al mes</span><b>{fmtMoney(monthlyTotal)}</b><span>{fmtMoney(annualTotal)} al año</span></div>
      </div>

      <div className="card">
        <h3>Compras a meses sin intereses</h3>
        {plans.length === 0 && <p className="muted">Aún no hay MSI activos. Se llenan solos cuando subes un estado de cuenta que los incluya; también puedes agregarlos a mano en la pantalla de confirmación.</p>}
        {plans.map((p) => {
          const pct = Math.round((p.current / p.total) * 100)
          const c = card(p.cardId)
          return (
            <div key={p.id} className="msi-item">
              <div className="card-title-row"><strong>{p.description}</strong><b>{fmtMoney(p.monthly)}/mes</b></div>
              <div className="muted">{label(c)} · termina en {fmtMonth(msiEndMonth(p))}</div>
              <div className="meter" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></div>
              <div className="msi-meta">
                <span>Pago <b>{p.current} de {p.total}</b></span>
                <span>Por liquidar: <b>{fmtMoney(p.remaining)}</b></span>
                <span>Al terminar liberas: <b>{fmtMoney(p.original)}</b> de tu línea</span>
              </div>
              <button className="ghost" onClick={() => removePlan(p.id)}>Quitar</button>
            </div>
          )
        })}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0 }}>Dinero ya comprometido</h3>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={6}>6 meses</option><option value={12}>12 meses</option>
          </select>
        </div>
        <p className="muted">Lo que ya pagarás cada mes solo por MSI y suscripciones, antes de hacer nuevos gastos.</p>
        <StackedBars
          rows={proj.map((r) => ({ ym: r.ym, label: r.label, total: r.total, segments: [{ value: r.msi, color: 'var(--accent)' }, { value: r.subs, color: '#f59e0b' }] }))}
          legend={[{ label: 'MSI', color: 'var(--accent)' }, { label: 'Suscripciones', color: '#f59e0b' }]} />
      </div>

      <div className="card">
        <h3>Suscripciones y cargos recurrentes</h3>
        {subs.length === 0 && <p className="muted">Todavía no detecto cargos recurrentes. Aparecen cuando el mismo comercio se repite en 2 meses con monto parecido, o si es un servicio conocido como Netflix o Spotify.</p>}
        {subs.map((s) => (
          <div key={s.key} className="list-row">
            <span>{s.name} <span className="muted">· {s.months} mes{s.months === 1 ? '' : 'es'}</span></span>
            <span style={{ textAlign: 'right' }}><b>{fmtMoney(s.monthly)}</b>/mes · {fmtMoney(s.monthly * 12)}/año <button className="ghost" onClick={() => setOv(s.key, false)}>No es suscripción</button></span>
          </div>
        ))}
        {subs.length > 0 && <p><b>Total: {fmtMoney(monthlyTotal)} al mes · {fmtMoney(annualTotal)} al año.</b></p>}
        {candidates.length > 0 && (
          <div className="row" style={{ marginTop: 8 }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Marcar otro cargo como suscripción…</option>
              {candidates.slice(0, 40).map((s) => <option key={s.key} value={s.key}>{s.name} · {fmtMoney(s.monthly)}</option>)}
            </select>
            <button className="ghost" disabled={!pick} onClick={() => { setOv(pick, true); setPick('') }}>Marcar</button>
          </div>
        )}
      </div>
    </section>
  )
}

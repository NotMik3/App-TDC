import React from 'react'
import CreditGauge from './CreditGauge.jsx'
import CycleTimeline from './CycleTimeline.jsx'
import DueAlerts from './DueAlerts.jsx'
import { cycleInfo, fmtDay } from '../lib/cycle.js'
import { utilPct } from '../lib/credit.js'
import { fmtMoney } from '../lib/plan.js'
import { monthSpending } from '../lib/categories.js'
import { activeMsi, nowMonth, projectCommitments } from '../lib/msi.js'

export default function Dashboard({ slot, data, latestByCard, latestByAccount, debitTotals, totalDebt, delta, monthInterest, setTab, backup }) {
  const hasAnything = data.cards.length + data.debitAccounts.length > 0
  const cards = data.cards.map((c) => {
    const st = latestByCard[c.id]
    const cy = st ? cycleInfo(st) : null
    const paidSum = st ? data.payments.filter((p) => p.cardId === c.id && (!st.cutoffDate || (p.date || '') >= st.cutoffDate)).reduce((a, p) => a + (p.amount || 0), 0) : 0
    const paid = !!st && st.noInterestPayment > 0 && paidSum >= st.noInterestPayment
    return { c, st, cy, paid }
  })
  const alerts = cards.filter((x) => x.cy && x.cy.inGrace && x.cy.level !== 'ok' && (x.st.balance || 0) > 0 && !x.paid)
  const withCycle = cards.filter((x) => x.cy)
  const withLimit = cards.filter((x) => x.st && x.c.limit > 0)
  const used = withLimit.reduce((a, x) => a + (x.st.balance || 0), 0)
  const lim = withLimit.reduce((a, x) => a + x.c.limit, 0)
  const totalPct = lim > 0 ? (used / lim) * 100 : null
  const cap = data.profile?.budgetCap || 0
  const spent = cap > 0 ? monthSpending(data, nowMonth()) : 0
  const budgetPct = cap > 0 ? (spent / cap) * 100 : 0
  const nextCommit = projectCommitments(data, 2)[1]
  const msiCount = activeMsi(data).length
  const name = (c) => `${c.bank || 'Banco'} ${c.product || ''}`.trim()

  return (
    <section>
      <h2 className="page-title">Dashboard</h2>
      {slot}
      {!hasAnything && (
        <div className="card">
          <p>Empieza vacía, sin saldos inventados. Arrastra arriba tu primer estado de cuenta (PDF o foto) y aquí verás todo junto.</p>
          <div className="row"><button className="ghost" onClick={() => setTab('debito')}>Subir estado de débito</button></div>
        </div>
      )}
      <DueAlerts items={alerts} />
      {hasAnything && backup.stale && (
        <div className="alert">💾 {backup.last ? `Tu último respaldo fue el ${backup.fmt(backup.last)}.` : 'Aún no has hecho un respaldo.'} Tus datos viven solo en este navegador. <button className="ghost" onClick={() => setTab('personalizar')}>Hacer respaldo</button></div>
      )}

      {hasAnything && (
        <div className="grid">
          <div className="card stat"><span>Deuda total (crédito)</span><b>{fmtMoney(totalDebt)}</b>{delta !== null && <span className={delta > 0 ? 'delta-up' : 'delta-down'}>{delta > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta))} vs mes anterior</span>}</div>
          <div className="card stat"><span>Dinero en débito</span><b>{fmtMoney(debitTotals.balance)}</b></div>
          <div className="card stat"><span>Posición neta</span><b>{fmtMoney(debitTotals.balance - totalDebt)}</b><span>débito menos deuda de crédito</span></div>
          <div className="card stat"><span>Intereses del mes</span><b>{fmtMoney(monthInterest)}</b></div>
        </div>
      )}

      {cap > 0 && (
        <div className="card">
          <h3>💰 Tope de presupuesto del mes</h3>
          <div className={`meter${budgetPct >= 100 ? ' red' : budgetPct >= 80 ? ' amber' : ''}`}><i style={{ width: `${Math.min(100, budgetPct)}%` }} /></div>
          <p><b>{fmtMoney(spent)}</b> de {fmtMoney(cap)} ({Math.round(budgetPct)} %){budgetPct >= 100 ? ' — 🚨 superaste tu tope' : budgetPct >= 80 ? ' — ⚠️ te acercas a tu tope' : ''}</p>
        </div>
      )}
      {nextCommit && nextCommit.total > 0 && (
        <button className="mini-item" onClick={() => setTab('msi')}>
          <span className="card-title-row"><strong>🗓️ Ya comprometido el próximo mes</strong><b>{fmtMoney(nextCommit.total)}</b></span>
          <span className="muted" style={{ display: 'block' }}>{msiCount} MSI activo{msiCount === 1 ? '' : 's'} + suscripciones, antes de nuevos gastos.</span>
        </button>
      )}

      {withCycle.length > 0 && (
        <div className="card">
          <h3>🛍️ Mejor día para comprar</h3>
          {withCycle.map(({ c, cy }) => (
            <div key={c.id} className="list-row">
              <span>{name(c)} <span className="muted">····{c.last4 || '----'}</span></span>
              <span style={{ textAlign: 'right' }}>
                {cy.bestDay
                  ? <><span className="badge-good">✅ Hoy es buen día</span><br /><span className="muted">Lo que compres hoy lo pagas hasta el {fmtDay(cy.nextDue)} (~{cy.daysToPayIfBuyToday} días).</span></>
                  : <><span className="badge-wait">Espera al corte</span><br /><span className="muted">Mejor a partir del {fmtDay(cy.Cn)} (en {cy.daysToCut} día{cy.daysToCut === 1 ? '' : 's'}).</span></>}
              </span>
            </div>
          ))}
        </div>
      )}

      {withLimit.length > 0 && (
        <div className="card">
          <h3>🌡️ Utilización de crédito</h3>
          <p className="muted">Mantenerla por debajo de 30 % ayuda a tu historial en Buró de Crédito; arriba de 50 % lo perjudica.</p>
          <div className="gauge-grid">
            <CreditGauge pct={totalPct} size={260} title="Total" sub={`${fmtMoney(used)} de ${fmtMoney(lim)}`} />
            {withLimit.length > 1 && withLimit.map(({ c, st }) => (
              <CreditGauge key={c.id} pct={utilPct(st.balance, c.limit)} size={160} title={`${name(c)} ····${c.last4 || '----'}`} sub={`${fmtMoney(st.balance)} de ${fmtMoney(c.limit)}`} />
            ))}
          </div>
        </div>
      )}
      {data.cards.length > 0 && withLimit.length === 0 && <div className="card"><p className="muted">Para ver tu termómetro de crédito, el estado de cuenta debe traer el límite de crédito. Puedes escribirlo con «Corregir».</p></div>}

      {cards.length > 0 && (
        <div className="card">
          <h3>📆 Ciclo de tus tarjetas</h3>
          {cards.map(({ c, st, cy, paid }) => (
            <button key={c.id} className="mini-item" onClick={() => setTab('credito')}>
              <span className="card-title-row">
                <span><strong>{name(c)}</strong> <span className="muted">····{c.last4 || '----'}</span></span>
                <b>{st ? fmtMoney(st.balance) : '—'}</b>
              </span>
              {st && <span className="muted" style={{ display: 'block' }}>Mínimo {fmtMoney(st.minimum)} · Sin intereses {fmtMoney(st.noInterestPayment)}{paid ? ' · ✅ pago registrado' : ''}</span>}
              {cy ? <CycleTimeline cy={cy} /> : <span className="muted" style={{ display: 'block' }}>Sin fechas de corte y límite: corrige el estado para ver su ciclo.</span>}
            </button>
          ))}
        </div>
      )}

      {data.debitAccounts.length > 0 && (
        <div className="card">
          <h3>Cuentas de débito ({data.debitAccounts.length})</h3>
          {data.debitAccounts.map((a) => {
            const l = latestByAccount[a.id]
            return (
              <button key={a.id} className="mini-item" onClick={() => setTab('debito')}>
                <span className="card-title-row">
                  <span><strong>{a.bank || 'Banco'} {a.name || ''}</strong> <span className="muted">····{a.last4 || '----'}</span></span>
                  <b>{l ? fmtMoney(l.closingBalance) : '—'}</b>
                </span>
                {l && <span className="muted" style={{ display: 'block' }}>Entró {fmtMoney(l.totalIncome)} · Salió {fmtMoney(l.totalExpenses)}</span>}
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

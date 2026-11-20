import React, { useState } from 'react'
import { simulateMinimumsOnly, simulateTogether, fmtMoney, fmtMonth } from '../lib/plan.js'
import { activeMsi, simulateAdvance } from '../lib/msi.js'

const rateOf = (c) => c.rate ?? c.cat ?? 0
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : 0 }

export default function Simulators({ data, latestByCard }) {
  const [extra, setExtra] = useState('1000')
  const [pick, setPick] = useState('')
  const rows = data.cards.map((c) => ({ c, st: latestByCard[c.id] })).filter((x) => x.st && (x.st.balance || 0) > 0)
  const name = (c) => `${c.bank || 'Banco'} ····${c.last4 || '----'}`

  // 1) mínimo vs. no generar intereses
  const minVs = rows.map(({ c, st }) => {
    const rate = rateOf(c)
    const only = simulateMinimumsOnly([{ balance: st.balance, rate }])
    const nextInterest = Math.max(0, st.balance - (st.minimum || 0)) * rate / 100 / 12
    return { c, st, rate, only, nextInterest }
  })

  // 2) a cuál abonar el extra
  const pc = rows.map(({ c, st }) => ({ id: c.id, name: name(c), balance: st.balance, rate: rateOf(c), minimum: st.minimum || 0 }))
  const extraN = num(extra)
  const baseMin = pc.reduce((a, x) => a + x.minimum, 0)
  const sim = pc.length >= 2 && extraN > 0 ? {
    avalanche: simulateTogether(pc, baseMin + extraN, 'avalanche'),
    snowball: simulateTogether(pc, baseMin + extraN, 'snowball'),
    onlyMin: simulateMinimumsOnly(pc),
  } : null
  const topAvalanche = [...pc].sort((a, b) => b.rate - a.rate)[0]
  const topSnowball = [...pc].sort((a, b) => a.balance - b.balance)[0]
  const best = sim ? (sim.avalanche.totalInterest <= sim.snowball.totalInterest ? 'avalanche' : 'snowball') : null

  // 3) adelantar un MSI
  const plans = activeMsi(data)
  const plan = plans.find((p) => p.id === pick)
  const adv = plan ? simulateAdvance(plan, data.cards.find((c) => c.id === plan.cardId), latestByCard[plan.cardId]) : null

  return (
    <section>
      <h2 className="page-title">Simuladores</h2>

      <div className="card">
        <h3>Pago mínimo vs. no generar intereses</h3>
        {minVs.length === 0 && <p className="muted">Sube un estado de cuenta con saldo para ver cuánto pagarías de más.</p>}
        {minVs.map(({ c, st, rate, only, nextInterest }) => (
          <div key={c.id} className="alert lvl-hoy">
            <strong>{name(c)}</strong>
            {rate === 0 && <div>No tengo la tasa de esta tarjeta; escríbela en «Corregir» para calcular los intereses.</div>}
            {rate > 0 && (
              <>
                <div>Si pagas solo el mínimo ({fmtMoney(st.minimum)}), el próximo mes se te cobrarían ≈ <b>{fmtMoney(nextInterest)}</b> de intereses.</div>
                <div>Si sigues así, tardarías <b>{only.months >= 600 ? 'más de 50 años' : `${only.months} meses`}</b> y pagarías ≈ <b>{fmtMoney(only.totalInterest)}</b> de intereses.</div>
              </>
            )}
            <div>Pagando {fmtMoney(st.noInterestPayment ?? st.balance)} (pago para no generar intereses) pagas <b>$0</b> de intereses.</div>
          </div>
        ))}
        <p className="muted">Estimación con interés mensual simple (tasa anual ÷ 12). Tu banco puede calcular distinto.</p>
      </div>

      <div className="card">
        <h3>¿A cuál tarjeta abonarle el dinero extra?</h3>
        {pc.length < 2 && <p className="muted">Necesitas al menos 2 tarjetas con saldo para comparar estrategias.</p>}
        {pc.length >= 2 && (
          <>
            <label>Dinero extra al mes sobre los mínimos ($)</label>
            <input inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} />
            {sim && (
              <div className="grid" style={{ marginTop: 12 }}>
                {[['avalanche', 'Avalancha', `Primero la de mayor tasa: ${topAvalanche.name}`], ['snowball', 'Bola de nieve', `Primero la de menor saldo: ${topSnowball.name}`]].map(([k, title, sub]) => (
                  <div key={k} className={`card stat${best === k ? ' best' : ''}`}>
                    <span>{title}{best === k ? ' · ✅ te conviene' : ''}</span>
                    <b>{sim[k].months} meses</b>
                    <span>Intereses: {fmtMoney(sim[k].totalInterest)}</span>
                    <span>Terminas en {fmtMonth(sim[k].payoffDate)}</span>
                    <span className="muted">{sub}</span>
                  </div>
                ))}
              </div>
            )}
            {sim && <p>💡 Con la mejor estrategia te ahorras ≈ <b>{fmtMoney(Math.max(0, sim.onlyMin.totalInterest - sim[best].totalInterest))}</b> en intereses frente a pagar solo mínimos.</p>}
          </>
        )}
      </div>

      <div className="card">
        <h3>Adelantar un MSI</h3>
        {plans.length === 0 && <p className="muted">No hay MSI activos para simular.</p>}
        {plans.length > 0 && (
          <>
            <select value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Elige una compra…</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.description} · {p.current}/{p.total} · {fmtMoney(p.monthly)}/mes</option>)}
            </select>
            {adv && (
              <div className="grid" style={{ marginTop: 12 }}>
                <div className="card stat"><span>Pagarías hoy</span><b>{fmtMoney(adv.payoff)}</b><span>saldo por liquidar</span></div>
                <div className="card stat"><span>Flujo mensual que liberas</span><b>{fmtMoney(adv.monthlyFreed)}</b><span>por {adv.monthsLeft} mes{adv.monthsLeft === 1 ? '' : 'es'}</span></div>
                <div className="card stat"><span>Línea de crédito que recuperas</span><b>{fmtMoney(adv.creditFreed)}</b>{adv.utilDropPts !== null && <span>baja tu uso ≈ {adv.utilDropPts.toFixed(1)} puntos</span>}</div>
              </div>
            )}
            <p className="muted">Sin intereses de por medio, adelantar solo cambia cuándo sale tu dinero; confirma con tu banco que no cobre comisión por liquidación anticipada.</p>
          </>
        )}
      </div>
    </section>
  )
}

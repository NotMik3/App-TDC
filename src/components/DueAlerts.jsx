import React from 'react'
import { fmtMoney } from '../lib/plan.js'
import { fmtDay } from '../lib/cycle.js'

// Alertas de urgencia: 5 días, 2 días o el mismo día de la fecha límite.
export default function DueAlerts({ items }) {
  if (!items.length) return null
  return (
    <>
      {items.map(({ c, st, cy }) => {
        const name = `${c.bank || 'Banco'} ····${c.last4 || '----'}`
        const head = cy.level === 'hoy' ? `🚨 ${name} vence HOY` : cy.level === 'dos' ? `⏰ ${name} vence en ${cy.daysToDue} día${cy.daysToDue === 1 ? '' : 's'}` : `⚠️ ${name} vence en ${cy.daysToDue} días`
        return (
          <div key={c.id} className={`alert lvl-${cy.level}`} role="alert">
            <strong>{head}</strong>
            <div>Paga <b>{fmtMoney(st.noInterestPayment)}</b> para no generar intereses (límite {fmtDay(cy.D)}).</div>
          </div>
        )
      })}
    </>
  )
}

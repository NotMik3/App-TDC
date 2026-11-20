import React from 'react'
import { fmtDay } from '../lib/cycle.js'

// Línea de tiempo del ciclo: Corte -> Periodo de gracia -> Fecha límite, con cuenta regresiva.
export default function CycleTimeline({ cy }) {
  const plural = (n) => `${n} día${n === 1 ? '' : 's'}`
  const mid = cy.inGrace ? 'Periodo de gracia' : 'Periodo de compras'
  const end = cy.inGrace ? `📅 Límite ${fmtDay(cy.D)}` : `✂️ Siguiente corte ${fmtDay(cy.Cn)}`
  const status = cy.inGrace
    ? (cy.daysToDue === 0 ? '¡Vence hoy!' : `Faltan ${plural(cy.daysToDue)} para la fecha límite de pago`)
    : `Siguiente corte en ${plural(cy.daysToCut)}`
  return (
    <div className="cycle">
      <div className="cycle-labels"><span>✂️ Corte {fmtDay(cy.C)}</span><span>{mid}</span><span>{end}</span></div>
      <div className="cycle-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(cy.pct)} aria-label={status}>
        <i className={cy.inGrace ? cy.level : 'compras'} style={{ width: `${cy.pct}%` }} />
        <b style={{ left: `${cy.pct}%` }} />
      </div>
      <p className={`cycle-status ${cy.inGrace ? cy.level : ''}`}>{status}</p>
      {cy.stale && <p className="muted">Este estado es de un ciclo anterior: las fechas son una proyección. Sube tu estado más reciente.</p>}
    </div>
  )
}

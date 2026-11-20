// Meses Sin Intereses: progreso, proyección de pagos y simulación de adelanto.
// `current` es la parcialidad que trae el último estado de cuenta (ej. 4 de 12); ese pago se paga el mes siguiente
// al mes del estado, y `remaining` = mensualidad × parcialidades que faltan después de esa.
import { detectSubscriptions } from './subscriptions.js'

const pad = (n) => String(n).padStart(2, '0')
export const monthAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
export const monthDiff = (a, b) => { const [y1, m1] = a.split('-').map(Number); const [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1) }
export const nowMonth = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
export const monthShort = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '') }

export const activeMsi = (data) => (data.msi || []).filter((p) => p.current < p.total).sort((a, b) => a.total - a.current - (b.total - b.current))
export const msiEndMonth = (p) => monthAdd(p.lastMonthKey, 1 + (p.total - p.current))

// Dinero comprometido por mes (MSI + suscripciones) para los próximos `months` meses, desde el mes actual.
export function projectCommitments(data, months = 12, now = new Date()) {
  const start = nowMonth(now)
  const subsMonthly = detectSubscriptions(data).monthlyTotal
  const plans = (data.msi || []).filter((p) => p.current <= p.total && p.monthly > 0)
  const out = []
  for (let k = 0; k < months; k++) {
    const ym = monthAdd(start, k)
    let msi = 0
    for (const p of plans) {
      const first = monthAdd(p.lastMonthKey, 1)
      const last = monthAdd(p.lastMonthKey, 1 + (p.total - p.current))
      if (ym >= first && ym <= last) msi += p.monthly
    }
    out.push({ ym, label: monthShort(ym), msi, subs: subsMonthly, total: msi + subsMonthly })
  }
  return out
}

// ¿Qué pasa si liquido este MSI hoy?
export function simulateAdvance(plan, card, statement) {
  const monthsLeft = plan.total - plan.current
  const payoff = plan.remaining
  const used = statement?.balance ?? null
  return {
    payoff, monthsLeft, monthlyFreed: plan.monthly, creditFreed: payoff,
    utilDropPts: card?.limit > 0 ? (payoff / card.limit) * 100 : null,
    utilBefore: card?.limit > 0 && used !== null ? (used / card.limit) * 100 : null,
  }
}

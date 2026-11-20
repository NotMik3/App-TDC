// Ciclo de la tarjeta: corte -> periodo de gracia -> fecha límite de pago.
const DAY = 86400000

export const toDate = (iso) => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY)
export function addMonths(d, n) {
  const y = d.getFullYear()
  const m = d.getMonth() + n
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(d.getDate(), last))
}
export const fmtDay = (d) => d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace('.', '') : '—'
export const fmtLong = (iso) => { const d = toDate(iso); return d ? d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' }

// Calcula en qué punto del ciclo estás hoy a partir del último estado de cuenta.
// Si el estado es de hace más de un ciclo, proyecta las fechas sumando meses (stale = true).
export function cycleInfo(statement, today = new Date()) {
  const C0 = toDate(statement?.cutoffDate)
  const D0 = toDate(statement?.dueDate)
  if (!C0 || !D0) return null
  const t = startOfDay(today)
  let shifted = 0
  if (t < C0) shifted = -1
  else while (shifted < 36 && addMonths(C0, shifted + 1) <= t) shifted++
  const C = addMonths(C0, shifted)
  const D = addMonths(D0, shifted)
  const Cn = addMonths(C0, shifted + 1)
  if (D <= C) return null // fechas incoherentes: mejor no mostrar una barra equivocada
  const nextDue = addMonths(D0, shifted + 1)
  const inGrace = t <= D
  const daysToDue = diffDays(D, t)
  const daysToCut = diffDays(Cn, t)
  const daysSinceCut = diffDays(t, C)
  let level = 'ok'
  if (inGrace) level = daysToDue <= 0 ? 'hoy' : daysToDue <= 2 ? 'dos' : daysToDue <= 5 ? 'cinco' : 'ok'
  const span = inGrace ? D - C : Cn - C
  const pct = Math.max(0, Math.min(100, ((t - C) / span) * 100))
  return {
    C, D, Cn, nextDue, inGrace, daysToDue, daysToCut, daysSinceCut, level, pct,
    stale: shifted > 0,
    bestDay: daysSinceCut >= 0 && daysSinceCut <= 3,
    daysToPayIfBuyToday: diffDays(nextDue, t),
  }
}

// Suscripciones = cargos recurrentes: el mismo comercio en 2 o más meses con monto casi igual
// (±15 %), o servicios conocidos (Netflix, Spotify…) aunque solo aparezcan una vez.
// El usuario manda: data.subOverrides[key] = true (sí es suscripción) / false (ignorar).
import { cargos, merchantName, ymOf } from './categories.js'

const KNOWN = /\b(NETFLIX|SPOTIFY|DISNEY|HBO|PRIME VIDEO|AMAZON PRIME|YOUTUBE|APPLE COM|ICLOUD|GOOGLE ONE|MICROSOFT|ADOBE|OPENAI|CHATGPT|CLARO VIDEO|VIX|PARAMOUNT|CANVA|DROPBOX|TIDAL|DEEZER|AUDIBLE|PLAYSTATION|XBOX|NINTENDO|DUOLINGO|SMARTFIT|SPORT CITY|TELCEL|TELMEX|IZZI|TOTALPLAY|MEGACABLE)\b/

export function detectSubscriptions(data) {
  const groups = new Map()
  for (const m of cargos(data)) {
    const key = merchantName(m.description)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(m)
  }
  const ov = data.subOverrides || {}
  const subs = []
  const candidates = []
  for (const [key, list] of groups) {
    list.sort((a, b) => (a.date < b.date ? 1 : -1))
    const byMonth = new Map()
    for (const m of list) if (!byMonth.has(ymOf(m.date))) byMonth.set(ymOf(m.date), m.amount)
    const amounts = [...byMonth.values()]
    const stable = amounts.length >= 2 && Math.max(...amounts) / Math.min(...amounts) <= 1.15
    const detected = stable || KNOWN.test(key)
    const item = { key, name: key, monthly: list[0].amount, months: byMonth.size, lastDate: list[0].date, detected }
    const enabled = ov[key] === false ? false : (detected || ov[key] === true)
    ;(enabled ? subs : candidates).push(item)
  }
  subs.sort((a, b) => b.monthly - a.monthly)
  candidates.sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1))
  return { subs, candidates, monthlyTotal: subs.reduce((a, s) => a + s.monthly, 0), annualTotal: subs.reduce((a, s) => a + s.monthly, 0) * 12 }
}

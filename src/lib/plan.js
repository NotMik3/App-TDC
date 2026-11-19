// Simulación del plan para liquidar. Educación y organización, no asesoría
// financiera personalizada. Interés mensual simple: saldo * tasa anual / 12.
export function simulateCard({ balance, rate, minimum, monthlyPayment }) {
  let saldo = balance
  let months = 0
  let totalInterest = 0
  let totalPaid = 0
  const r = (rate || 0) / 100 / 12
  const pay = Math.max(monthlyPayment || 0, 0)
  if (saldo <= 0) return { months: 0, totalInterest: 0, totalPaid: 0, payoffDate: null, feasible: true }
  if (pay <= 0) return { months: Infinity, totalInterest: Infinity, totalPaid: 0, payoffDate: null, feasible: false }
  while (saldo > 0.005 && months < 600) {
    const interest = saldo * r
    totalInterest += interest
    saldo += interest
    const p = Math.min(pay, saldo)
    saldo -= p
    totalPaid += p
    months++
    if (pay <= interest && months > 1) return { months: Infinity, totalInterest: Infinity, totalPaid, payoffDate: null, feasible: false }
  }
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return { months, totalInterest, totalPaid, payoffDate: d.toISOString().slice(0, 7), feasible: months < 600 }
}

export function simulateTogether(cards, monthlyBudget, strategy) {
  // cards: [{id, balance, rate, minimum}]
  const state = cards.map((c) => ({ ...c, saldo: c.balance }))
  let months = 0
  let totalInterest = 0
  let totalPaid = 0
  const order = (list) => {
    const arr = [...list]
    if (strategy === 'avalanche') arr.sort((a, b) => (b.rate || 0) - (a.rate || 0))
    else arr.sort((a, b) => a.saldo - b.saldo)
    return arr
  }
  while (state.some((c) => c.saldo > 0.005) && months < 600) {
    let budget = monthlyBudget
    // 1) mínimos a todas
    for (const c of state) {
      if (c.saldo <= 0.005) continue
      const interest = c.saldo * ((c.rate || 0) / 100 / 12)
      totalInterest += interest
      c.saldo += interest
      const p = Math.min(c.minimum || 0, c.saldo, budget)
      c.saldo -= p
      budget -= p
      totalPaid += p
    }
    // 2) extra a la tarjeta prioritaria
    for (const c of order(state.filter((x) => x.saldo > 0.005))) {
      if (budget <= 0) break
      const p = Math.min(budget, c.saldo)
      c.saldo -= p
      budget -= p
      totalPaid += p
    }
    months++
    if (months > 1 && totalPaid === 0) break
  }
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return { months, totalInterest, totalPaid, payoffDate: months < 600 ? d.toISOString().slice(0, 7) : null, feasible: months < 600 }
}

export function simulateMinimumsOnly(cards) {
  let totalInterest = 0
  let months = 0
  for (const c of cards) {
    // Mínimo realista: intereses del periodo + 1.5% del saldo (mínimo $100).
    // Así el saldo sí baja mes a mes; pagar solo el mínimo tarda mucho
    // pero termina, a diferencia de un mínimo fijo menor que el interés.
    let saldo = c.balance
    let m = 0
    let interest = 0
    const r = (c.rate || 0) / 100 / 12
    while (saldo > 0.005 && m < 600) {
      const i = saldo * r
      interest += i
      saldo += i
      const p = Math.min(i + Math.max(saldo * 0.015, 100), saldo)
      saldo -= p
      m++
    }
    totalInterest += interest
    months = Math.max(months, m)
  }
  return { months, totalInterest }
}

export const fmtMoney = (v) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  return '$' + Math.round(v).toLocaleString('es-MX')
}
export const fmtMonth = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${names[parseInt(m, 10) - 1] || ''} ${y}`
}

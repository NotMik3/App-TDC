// Guarda un estado de cuenta nuevo en los datos sin duplicar nada:
//  - liga la tarjeta por sus últimos 4 dígitos (la crea si no existe)
//  - si ya había un estado del mismo mes de esa tarjeta, lo reemplaza (PDF actualizado)
//  - omite movimientos que ya existían en otros estados (mismo día, descripción y monto)
//  - actualiza los planes MSI existentes en vez de duplicarlos
export const norm = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null }
const int = (v) => { const n = parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : null }
const last4Of = (f) => String(f.last4 || '').replace(/\D/g, '').slice(-4)

export const moveHash = (m) => `${m.date}|${norm(m.description).slice(0, 40)}|${(num(m.amount) ?? 0).toFixed(2)}|${m.currency || 'MXN'}`
export const msiKey = (cardId, m) => `${cardId}|${norm(m.description).slice(0, 24)}|${int(m.total)}`

function cleanMsi(list) {
  return (list || []).map((m) => ({
    description: String(m.description || '').trim(), current: int(m.current), total: int(m.total),
    monthly: num(m.monthly), original: num(m.original),
  })).filter((m) => m.description && m.total >= 2 && m.current >= 1 && m.current <= m.total && m.monthly > 0)
}

// Vista previa (no modifica nada): qué pasaría si se confirma este estado.
export function planStatementSave(data, f) {
  const last4 = last4Of(f)
  const card = last4 ? data.cards.find((c) => c.last4 === last4) || null : null
  const monthKey = f.monthKey || (f.cutoffDate ? String(f.cutoffDate).slice(0, 7) : new Date().toISOString().slice(0, 7))
  const sameMonth = card ? data.statements.find((s) => s.cardId === card.id && s.monthKey === monthKey && s.id !== f.id) || null : null
  const duplicateFile = f.fileHash ? data.statements.find((s) => s.fileHash === f.fileHash && s.id !== f.id) || null : null
  const existing = new Set()
  if (card) for (const m of data.movements || []) if (m.cardId === card.id && (!sameMonth || m.statementId !== sameMonth.id)) existing.add(m.hash)
  const seen = new Map()
  const fresh = []
  let skipped = 0
  for (const m of f.movements || []) {
    if (!m.description || num(m.amount) === null) continue
    const base = moveHash(m)
    const n = (seen.get(base) || 0) + 1
    seen.set(base, n)
    const hash = `${base}#${n}`
    if (existing.has(hash)) skipped++
    else fresh.push({ ...m, hash })
  }
  const list = cleanMsi(f.msi)
  let msiUpdated = 0
  if (card) for (const m of list) if ((data.msi || []).some((x) => x.key === msiKey(card.id, m))) msiUpdated++
  return { card, last4, monthKey, sameMonth, duplicateFile, fresh, added: fresh.length, skipped, msiTotal: list.length, msiUpdated, msiNew: list.length - msiUpdated }
}

export function applyStatement(data, f, uid) {
  const p = planStatementSave(data, f)
  let cards = data.cards
  let cardId = p.card ? p.card.id : null
  if (!cardId) {
    cardId = uid()
    cards = [...cards, { id: cardId, bank: f.bank || '', product: f.product || '', last4: p.last4, limit: num(f.limit), rate: num(f.rate), cat: num(f.cat), createdAt: new Date().toISOString() }]
  } else {
    cards = cards.map((c) => c.id === cardId ? { ...c, bank: f.bank || c.bank, product: f.product || c.product, limit: num(f.limit) ?? c.limit, rate: num(f.rate) ?? c.rate, cat: num(f.cat) ?? c.cat } : c)
  }
  const statementId = uid()
  const statement = {
    id: statementId, cardId, monthKey: p.monthKey,
    balance: num(f.balance), minimum: num(f.minimum), noInterestPayment: num(f.noInterestPayment),
    interest: num(f.interest), commissions: num(f.commissions),
    cutoffDate: f.cutoffDate || '', dueDate: f.dueDate || '',
    fileName: f.fileName || '', fileType: f.fileType || '', fileDataUrl: f.fileDataUrl || null,
    fileHash: f.fileHash || '', fxRate: num(f.fxRate), createdAt: new Date().toISOString(),
  }
  const statements = [...data.statements.filter((s) => !p.sameMonth || s.id !== p.sameMonth.id), statement]
  const movements = [
    ...(data.movements || []).filter((m) => !p.sameMonth || m.statementId !== p.sameMonth.id),
    ...p.fresh.map((m) => ({
      id: uid(), statementId, cardId, date: m.date, description: String(m.description).trim(), amount: num(m.amount),
      kind: m.kind || 'cargo', currency: m.currency || 'MXN', original: m.original || null, category: m.category || '', hash: m.hash,
    })),
  ]
  const msi = [...(data.msi || [])]
  for (const m of cleanMsi(f.msi)) {
    const key = msiKey(cardId, m)
    const rec = { description: m.description, total: m.total, current: m.current, monthly: m.monthly, original: m.original ?? Math.round(m.monthly * m.total * 100) / 100, remaining: Math.round(m.monthly * (m.total - m.current) * 100) / 100, lastMonthKey: p.monthKey, lastStatementId: statementId }
    const i = msi.findIndex((x) => x.key === key)
    if (i >= 0) { if ((msi[i].lastMonthKey || '') <= p.monthKey) msi[i] = { ...msi[i], ...rec } }
    else msi.push({ id: uid(), key, cardId, firstMonthKey: p.monthKey, ...rec })
  }
  return { data: { ...data, cards, statements, movements, msi }, summary: { added: p.added, skipped: p.skipped, replaced: !!p.sameMonth, msiNew: p.msiNew, msiUpdated: p.msiUpdated, cardCreated: !p.card } }
}

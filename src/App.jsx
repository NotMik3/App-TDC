import React, { useEffect, useMemo, useRef, useState } from 'react'
import { extractPdfText, parseStatementText, parseDebitStatementText, monthKeyFromDate } from './lib/parse.js'
import { simulateCard, simulateTogether, simulateMinimumsOnly, recommendedJoint, fmtMoney, fmtMonth, setPrivacy } from './lib/plan.js'
import { THEMES, DEFAULT_APPEARANCE, resolveAppearance, RADIUS, FONT_SIZE } from './lib/themes.js'

const LS_KEY = 'app-tdc-v1'
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const emptyData = () => ({ cards: [], statements: [], payments: [], debitAccounts: [], debitStatements: [], profile: { name: '' }, plan: { mode: 'juntas', strategy: 'avalanche', monthlyBudget: 0, perCard: {} }, appearance: { ...DEFAULT_APPEARANCE } })

function useStored() {
  const [data, setData] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) return emptyData()
      const p = JSON.parse(raw)
      const d = emptyData()
      return {
        ...d, ...p,
        cards: p.cards || [], statements: p.statements || [], payments: p.payments || [],
        debitAccounts: p.debitAccounts || [], debitStatements: p.debitStatements || [],
        profile: { ...d.profile, ...(p.profile || {}) },
        plan: { ...d.plan, ...(p.plan || {}) },
        appearance: { ...d.appearance, ...(p.appearance || {}) },
      }
    } catch { return emptyData() }
  })
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {} }, [data])
  return [data, setData]
}

function numOrNull(v) { const n = parseFloat(String(v).replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null }

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file) })
}

const FIELD_LABELS = [
  ['bank', 'Banco'], ['product', 'Producto'], ['last4', 'Últimos 4 dígitos'], ['limit', 'Límite de crédito'],
  ['rate', 'Tasa anual (%)'], ['cat', 'CAT (%)'], ['balance', 'Saldo'], ['minimum', 'Pago mínimo'],
  ['noInterestPayment', 'Pago para no generar intereses'], ['interest', 'Intereses'], ['commissions', 'Comisiones'],
  ['cutoffDate', 'Fecha de corte'], ['dueDate', 'Fecha límite de pago'],
]
const MONEY_FIELDS = new Set(['limit', 'balance', 'minimum', 'noInterestPayment', 'interest', 'commissions'])

const DEBIT_FIELD_LABELS = [
  ['bank', 'Banco'], ['name', 'Cuenta (ej. Nómina, Ahorro)'], ['last4', 'Últimos 4 dígitos'],
  ['closingBalance', 'Saldo final'], ['totalIncome', 'Entró en el mes (depósitos/abonos)'],
  ['totalExpenses', 'Salió en el mes (retiros/cargos)'], ['fees', 'Comisiones'],
  ['interestEarned', 'Rendimientos / intereses ganados'], ['largestExpense', 'Mayor gasto del mes (opcional)'],
  ['largestExpenseDesc', 'De qué fue ese gasto mayor (opcional)'], ['cutoffDate', 'Fecha de corte'],
]
const DEBIT_MONEY_FIELDS = new Set(['closingBalance', 'totalIncome', 'totalExpenses', 'fees', 'interestEarned', 'largestExpense'])

function StatementForm({ draft, onSave, onCancel }) {
  const [f, setF] = useState(draft)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div className="card">
      <h3>{draft.id ? 'Corregir estado de cuenta' : 'Revisar datos detectados'} — {draft.fileName}</h3>
      {draft.detected && <p className="muted">Detectado automáticamente del PDF. Corrige solo lo que esté mal.</p>}
      {!draft.detected && <p className="muted">No se pudo leer el texto automáticamente (foto o PDF protegido). Llena los datos a mano; es el respaldo para PDFs con contraseña.</p>}
      <div className="grid">
        {FIELD_LABELS.map(([k, label]) => (
          <div key={k}>
            <label>{label}</label>
            <input type={k === 'cutoffDate' || k === 'dueDate' ? 'date' : 'text'}
              inputMode={MONEY_FIELDS.has(k) || k === 'rate' || k === 'cat' ? 'decimal' : 'text'}
              value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={label} />
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => onSave(f)}>Guardar estado de cuenta</button>
        <button className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}
function DebitStatementForm({ draft, onSave, onCancel }) {
  const [f, setF] = useState(draft)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <div className="card">
      <h3>{draft.id ? 'Corregir estado de débito' : 'Revisar datos detectados'} — {draft.fileName}</h3>
      {draft.detected && <p className="muted">Detectado automáticamente del PDF. Corrige solo lo que esté mal.</p>}
      {!draft.detected && <p className="muted">No se pudo leer el texto automáticamente (foto o PDF protegido). Llena los datos a mano.</p>}
      <p className="muted">El desglose por categorías y el mayor gasto no se detectan solos del texto del estado: si quieres registrarlos, escríbelos abajo.</p>
      <div className="grid">
        {DEBIT_FIELD_LABELS.map(([k, label]) => (
          <div key={k}>
            <label>{label}</label>
            <input type={k === 'cutoffDate' ? 'date' : 'text'}
              inputMode={DEBIT_MONEY_FIELDS.has(k) ? 'decimal' : 'text'}
              value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} placeholder={label} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <label>Desglose por categorías (opcional, a mano)</label>
        {(f.categories || []).map((c, i) => (
          <div className="row" key={i} style={{ marginTop: 6 }}>
            <input value={c.name} placeholder="Categoría (ej. Comida)" onChange={(e) => set('categories', f.categories.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input inputMode="decimal" value={c.amount} placeholder="Monto" onChange={(e) => set('categories', f.categories.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
            <button className="ghost" onClick={() => set('categories', f.categories.filter((_, j) => j !== i))}>Quitar</button>
          </div>
        ))}
        <button className="ghost" style={{ marginTop: 6 }} onClick={() => set('categories', [...(f.categories || []), { name: '', amount: '' }])}>+ Agregar categoría</button>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => onSave(f)}>Guardar estado de débito</button>
        <button className="ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  )
}

function BarChart({ data, label }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div>
      <strong>{label}</strong>
      <div className="bar-chart">
        {data.map((d) => (
          <div className="bar" key={d.label} title={`${d.label}: ${fmtMoney(d.value)}`}>
            <i style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
            <span>{d.label}<br />{fmtMoney(d.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UploadZone({ onFiles, big, label, hint }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef(null)
  return (
    <div className={`dropzone${drag ? ' drag' : ''}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}>
      <div style={{ fontSize: big ? '1.2em' : '1em' }}>{label || '📄 Subir estado de cuenta (PDF o foto)'}</div>
      <div className="muted">{hint || 'Arrastra aquí o toca para elegir. Puedes subir varios meses de una vez.'}</div>
      <input ref={ref} type="file" accept=".pdf,image/*" multiple style={{ display: 'none' }}
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}

const TABS = [
  ['dashboard', '🏠', 'Dashboard'],
  ['credito', '💳', 'TDC (Crédito)'],
  ['debito', '🏦', 'TDD (Débito)'],
  ['calendario', '📅', 'Calendario'],
  ['plan', '🎯', 'Plan para liquidar'],
  ['pagos', '💵', 'Pagos'],
  ['personalizar', '🎨', 'Personalizar'],
]

export default function App() {
  const [data, setData] = useStored()
  const [tab, setTab] = useState('dashboard')
  const [pending, setPending] = useState(null) // draft de estado por confirmar
  const [editing, setEditing] = useState(null) // statement en corrección
  const [debitPending, setDebitPending] = useState(null)
  const [debitEditing, setDebitEditing] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [chartView, setChartView] = useState('saldo') // saldo | interes | pagos
  const [debitChartView, setDebitChartView] = useState('saldo') // saldo | flujo | ahorro
  const [calMonth, setCalMonth] = useState(new Date().toISOString().slice(0, 7))
  const [extra, setExtra] = useState('')
  const appearance = resolveAppearance(data.appearance)
  const hideAmounts = !!data.profile?.hideAmounts
  setPrivacy(hideAmounts)

  const latestByCard = useMemo(() => {
    const map = {}
    for (const s of data.statements) {
      if (!map[s.cardId] || (s.monthKey || '') >= (map[s.cardId].monthKey || '')) map[s.cardId] = s
    }
    return map
  }, [data.statements])

  const firstByCard = useMemo(() => {
    const map = {}
    for (const s of data.statements) {
      if (!map[s.cardId] || (s.monthKey || '') < (map[s.cardId].monthKey || '')) map[s.cardId] = s
    }
    return map
  }, [data.statements])

  const totalDebt = useMemo(() => Object.values(latestByCard).reduce((a, s) => a + (s.balance || 0), 0), [latestByCard])
  const monthTotals = useMemo(() => {
    const byMonth = {}
    for (const s of data.statements) {
      const k = s.monthKey || monthKeyFromDate(s.cutoffDate)
      byMonth[k] = byMonth[k] || { balance: 0, interest: 0 }
      byMonth[k].balance += s.balance || 0
      byMonth[k].interest += s.interest || 0
    }
    return Object.keys(byMonth).sort().map((k) => ({ month: k, ...byMonth[k] }))
  }, [data.statements])
  const lastMonth = monthTotals[monthTotals.length - 1]
  const prevMonth = monthTotals[monthTotals.length - 2]
  const delta = lastMonth && prevMonth ? lastMonth.balance - prevMonth.balance : null
  const monthInterest = lastMonth ? lastMonth.interest : 0
  const totalLimit = data.cards.reduce((a, c) => a + (c.limit || 0), 0)
  const usage = totalLimit > 0 ? Math.round((totalDebt / totalLimit) * 100) : 0
  const nextDue = useMemo(() => {
    const dates = data.statements.map((s) => s.dueDate).filter(Boolean).sort()
    const today = new Date().toISOString().slice(0, 10)
    return dates.find((d) => d >= today) || dates[dates.length - 1] || null
  }, [data.statements])

  // Pagos registrados por mes, para la gráfica "Pagos realizados"
  const paymentsByMonth = useMemo(() => {
    const byMonth = {}
    for (const p of data.payments) {
      const k = (p.date || '').slice(0, 7)
      if (k) byMonth[k] = (byMonth[k] || 0) + (p.amount || 0)
    }
    return byMonth
  }, [data.payments])
  const chartData = useMemo(() => {
    let acum = 0
    return monthTotals.map((m) => {
      acum += m.interest || 0
      return { month: m.month, label: fmtMonth(m.month), saldo: m.balance, interesAcum: acum, pagos: paymentsByMonth[m.month] || 0 }
    })
  }, [monthTotals, paymentsByMonth])

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    for (const file of files) {
      setBusy(`Leyendo ${file.name}…`)
      try {
        let parsed = { bank: null, product: null, last4: null, limit: null, rate: null, cat: null, balance: null, minimum: null, noInterestPayment: null, interest: null, commissions: null, cutoffDate: null, dueDate: null }
        let detected = false
        let dataUrl = null
        try { dataUrl = await fileToDataUrl(file) } catch {}
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const text = await extractPdfText(file)
            parsed = parseStatementText(text)
            detected = Object.values(parsed).some((v) => v !== null && v !== '')
          } catch (e) { detected = false }
        }
        setPending({
          id: null, fileName: file.name, fileType: file.type, fileDataUrl: dataUrl,
          ...parsed, detected,
          monthKey: monthKeyFromDate(parsed.cutoffDate),
        })
        setTab('credito')
        setNotice(detected ? `Detecté datos de ${file.name}. Revísalos y guarda.` : `${file.name}: no se pudo leer automáticamente. Llena los datos a mano.`)
        return // uno por uno: el usuario confirma cada estado antes del siguiente
      } finally { setBusy('') }
    }
  }

  function saveStatement(f) {
    const balance = numOrNull(f.balance)
    const last4 = String(f.last4 || '').replace(/\D/g, '').slice(-4)
    let cardId = null
    let cards = data.cards
    if (last4) {
      const existing = data.cards.find((c) => c.last4 === last4)
      if (existing) cardId = existing.id
    }
    if (!cardId) {
      cardId = uid()
      const card = { id: cardId, bank: f.bank || '', product: f.product || '', last4, limit: numOrNull(f.limit), rate: numOrNull(f.rate), cat: numOrNull(f.cat), createdAt: new Date().toISOString() }
      cards = [...cards, card]
    } else {
      cards = cards.map((c) => c.id === cardId ? { ...c, bank: f.bank || c.bank, product: f.product || c.product, limit: numOrNull(f.limit) ?? c.limit, rate: numOrNull(f.rate) ?? c.rate, cat: numOrNull(f.cat) ?? c.cat } : c)
    }
    const monthKey = f.monthKey || monthKeyFromDate(f.cutoffDate)
    const statement = {
      id: f.id || uid(), cardId, monthKey,
      balance, minimum: numOrNull(f.minimum), noInterestPayment: numOrNull(f.noInterestPayment),
      interest: numOrNull(f.interest), commissions: numOrNull(f.commissions),
      cutoffDate: f.cutoffDate || '', dueDate: f.dueDate || '',
      fileName: f.fileName || '', fileType: f.fileType || '', fileDataUrl: f.fileDataUrl || null,
    }
    const statements = f.id ? data.statements.map((s) => s.id === f.id ? statement : s) : [...data.statements, statement]
    setData({ ...data, cards, statements })
    setPending(null); setEditing(null)
    setNotice(f.id ? 'Estado de cuenta corregido.' : 'Estado de cuenta guardado. La tarjeta quedó detectada y ligada por su terminación.')
    setTab('credito')
  }

  function deleteStatement(id) { if (confirm('¿Eliminar este estado de cuenta?')) setData({ ...data, statements: data.statements.filter((s) => s.id !== id) }) }
  function deleteCard(id) {
    if (!confirm('¿Eliminar esta tarjeta y sus estados?')) return
    setData({ ...data, cards: data.cards.filter((c) => c.id !== id), statements: data.statements.filter((s) => s.cardId !== id), payments: data.payments.filter((p) => p.cardId !== id) })
  }

  // ---------- Débito (TDD) ----------
  const latestByAccount = useMemo(() => {
    const map = {}
    for (const s of data.debitStatements) {
      if (!map[s.accountId] || (s.monthKey || '') >= (map[s.accountId].monthKey || '')) map[s.accountId] = s
    }
    return map
  }, [data.debitStatements])

  const debitTotals = useMemo(() => {
    let balance = 0, income = 0, expenses = 0, fees = 0, earned = 0
    for (const a of data.debitAccounts) {
      const l = latestByAccount[a.id]
      if (l) { balance += l.closingBalance || 0; income += l.totalIncome || 0; expenses += l.totalExpenses || 0; fees += l.fees || 0; earned += l.interestEarned || 0 }
    }
    return { balance, income, expenses, fees, earned, net: income - expenses }
  }, [data.debitAccounts, latestByAccount])

  const debitHistory = useMemo(() => {
    const byMonth = {}
    for (const s of data.debitStatements) {
      const k = s.monthKey || monthKeyFromDate(s.cutoffDate)
      byMonth[k] = byMonth[k] || { saldo: 0, ingresos: 0, gastos: 0 }
      byMonth[k].saldo += s.closingBalance || 0
      byMonth[k].ingresos += s.totalIncome || 0
      byMonth[k].gastos += s.totalExpenses || 0
    }
    return Object.keys(byMonth).sort().map((k) => ({
      month: k, label: fmtMonth(k), ...byMonth[k],
      ahorro: byMonth[k].ingresos > 0 ? Math.round(((byMonth[k].ingresos - byMonth[k].gastos) / byMonth[k].ingresos) * 100) : 0,
    }))
  }, [data.debitStatements])

  async function handleDebitFiles(fileList) {
    const files = Array.from(fileList || [])
    if (!files.length) return
    for (const file of files) {
      setBusy(`Leyendo ${file.name}…`)
      try {
        let parsed = { bank: null, last4: null, closingBalance: null, totalIncome: null, totalExpenses: null, fees: null, interestEarned: null, cutoffDate: null }
        let detected = false
        let dataUrl = null
        try { dataUrl = await fileToDataUrl(file) } catch {}
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const text = await extractPdfText(file)
            parsed = parseDebitStatementText(text)
            detected = Object.values(parsed).some((v) => v !== null && v !== '')
          } catch (e) { detected = false }
        }
        setDebitPending({
          id: null, fileName: file.name, fileType: file.type, fileDataUrl: dataUrl,
          name: '', largestExpense: '', largestExpenseDesc: '', categories: [],
          ...parsed, detected,
          monthKey: monthKeyFromDate(parsed.cutoffDate),
        })
        setTab('debito')
        setNotice(detected ? `Detecté datos de ${file.name}. Revísalos y guarda.` : `${file.name}: no se pudo leer automáticamente. Llena los datos a mano.`)
        return
      } finally { setBusy('') }
    }
  }

  function saveDebitStatement(f) {
    const last4 = String(f.last4 || '').replace(/\D/g, '').slice(-4)
    let accountId = null
    let debitAccounts = data.debitAccounts
    if (last4) {
      const existing = data.debitAccounts.find((a) => a.last4 === last4)
      if (existing) accountId = existing.id
    }
    if (!accountId) {
      accountId = uid()
      const account = { id: accountId, bank: f.bank || '', name: f.name || 'Cuenta de débito', last4, createdAt: new Date().toISOString() }
      debitAccounts = [...debitAccounts, account]
    } else {
      debitAccounts = debitAccounts.map((a) => a.id === accountId ? { ...a, bank: f.bank || a.bank, name: f.name || a.name } : a)
    }
    const monthKey = f.monthKey || monthKeyFromDate(f.cutoffDate)
    const statement = {
      id: f.id || uid(), accountId, monthKey,
      closingBalance: numOrNull(f.closingBalance), totalIncome: numOrNull(f.totalIncome),
      totalExpenses: numOrNull(f.totalExpenses), fees: numOrNull(f.fees),
      interestEarned: numOrNull(f.interestEarned),
      largestExpense: numOrNull(f.largestExpense), largestExpenseDesc: f.largestExpenseDesc || '',
      categories: (f.categories || []).map((c) => ({ name: String(c.name || '').trim(), amount: numOrNull(c.amount) })).filter((c) => c.name && c.amount > 0),
      cutoffDate: f.cutoffDate || '',
      fileName: f.fileName || '', fileType: f.fileType || '', fileDataUrl: f.fileDataUrl || null,
    }
    const debitStatements = f.id ? data.debitStatements.map((s) => s.id === f.id ? statement : s) : [...data.debitStatements, statement]
    setData({ ...data, debitAccounts, debitStatements })
    setDebitPending(null); setDebitEditing(null)
    setNotice(f.id ? 'Estado de débito corregido.' : 'Estado de débito guardado. La cuenta quedó detectada y ligada por su terminación.')
    setTab('debito')
  }

  function deleteDebitStatement(id) { if (confirm('¿Eliminar este estado de débito?')) setData({ ...data, debitStatements: data.debitStatements.filter((s) => s.id !== id) }) }
  function deleteDebitAccount(id) {
    if (!confirm('¿Eliminar esta cuenta de débito y sus estados?')) return
    setData({ ...data, debitAccounts: data.debitAccounts.filter((a) => a.id !== id), debitStatements: data.debitStatements.filter((s) => s.accountId !== id) })
  }

  // ---------- Plan ----------
  const planCards = data.cards.map((c) => ({ ...c, balance: latestByCard[c.id]?.balance || 0, minimum: latestByCard[c.id]?.minimum || 0 }))
  const plan = data.plan
  const setPlan = (patch) => setData({ ...data, plan: { ...plan, ...patch } })
  const together = planCards.length ? simulateTogether(planCards, plan.monthlyBudget || 0, plan.strategy) : null
  const minimumsOnly = planCards.length ? simulateMinimumsOnly(planCards) : null
  const perCardSim = planCards.map((c) => ({ card: c, sim: simulateCard({ balance: c.balance, rate: c.rate, minimum: c.minimum, monthlyPayment: plan.perCard[c.id] || 0 }) }))
  const recJoint = plan.mode === 'juntas' && (plan.monthlyBudget || 0) > 0 && planCards.length
    ? recommendedJoint(planCards, plan.monthlyBudget, plan.strategy) : null

  // Pago recomendado de este mes para cada tarjeta, según el plan elegido (v2)
  function planInfoFor(c) {
    const latest = latestByCard[c.id]
    if (!latest) return null
    if (plan.mode === 'por_tarjeta') {
      const amt = plan.perCard[c.id] || 0
      if (!amt) return null
      const sim = simulateCard({ balance: c.balance, rate: c.rate, minimum: c.minimum, monthlyPayment: amt })
      return {
        recommended: amt,
        note: sim.feasible
          ? `Tu plan por tarjeta · libre de esta deuda en ${fmtMonth(sim.payoffDate)}`
          : 'Tu plan por tarjeta · con ese pago no se liquida, no cubre los intereses.',
      }
    }
    if (!recJoint) return null
    const amt = recJoint.get(c.id) || 0
    if (!amt) return null
    return {
      recommended: amt,
      note: `Tu plan juntas (${plan.strategy === 'snowball' ? 'bola de nieve' : 'avalancha'}) · pago de este mes según tu presupuesto de ${fmtMoney(plan.monthlyBudget)}`,
    }
  }

  // ---------- Respaldo ----------
  const backupRef = useRef(null)
  const lastBackup = data.profile?.lastBackup || ''
  const backupStale = !lastBackup || (Date.now() - new Date(lastBackup).getTime()) > 30 * 86400000
  const fmtBackup = (iso) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  function exportBackup() {
    const stamp = new Date().toISOString()
    const next = { ...data, profile: { ...(data.profile || {}), lastBackup: stamp } }
    const blob = new Blob([JSON.stringify({ app: 'app-tdc', version: 1, exportedAt: stamp, data: next }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `app-tdc-respaldo-${stamp.slice(0, 10)}.json`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setData(next)
    setNotice('Respaldo descargado. Guárdalo en un lugar seguro (nube, correo o USB): trae tus estados y datos personales.')
  }

  async function importBackup(file) {
    if (!file) return
    try {
      const parsed = JSON.parse(await file.text())
      const src = parsed && parsed.data ? parsed.data : parsed
      const valid = src && typeof src === 'object' && (Array.isArray(src.cards) || Array.isArray(src.debitAccounts))
      if (!valid) throw new Error('formato')
      if (!confirm('Esto reemplaza TODOS los datos actuales de la app con los del respaldo. ¿Continuar?')) return
      const d = emptyData()
      setData({
        ...d, ...src,
        cards: src.cards || [], statements: src.statements || [], payments: src.payments || [],
        debitAccounts: src.debitAccounts || [], debitStatements: src.debitStatements || [],
        profile: { ...d.profile, ...(src.profile || {}) },
        plan: { ...d.plan, ...(src.plan || {}) },
        appearance: { ...d.appearance, ...(src.appearance || {}) },
      })
      setPending(null); setEditing(null); setDebitPending(null); setDebitEditing(null)
      setTab('dashboard')
      setNotice('Respaldo restaurado. Tus datos ya están de vuelta.')
    } catch {
      setNotice('No pude leer ese archivo. Elige un respaldo .json que hayas descargado desde esta app.')
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const upcoming = data.cards
    .map((c) => ({ c, s: latestByCard[c.id] }))
    .filter((x) => x.s && x.s.dueDate)
    .map((x) => ({ ...x, days: Math.round((new Date(x.s.dueDate + 'T00:00:00') - new Date(todayStr + 'T00:00:00')) / 86400000) }))
    .sort((a, b) => a.days - b.days)
  const hasAnything = data.cards.length + data.debitAccounts.length > 0
  const urgent = upcoming.filter((u) => u.days >= 0 && u.days <= 5)
  const urgentBanner = urgent.length > 0 && (
    <div className="alert urgent" role="alert">
      <strong>⚠️ Pagos por vencer</strong>
      {urgent.map(({ c, s: st, days }) => (
        <div key={c.id}>{c.bank || 'Banco'} ····{c.last4 || '----'} vence {days === 0 ? 'hoy' : `en ${days} día${days === 1 ? '' : 's'}`} ({st.dueDate}) · para no generar interés: <b>{fmtMoney(st.noInterestPayment)}</b></div>
      ))}
    </div>
  )

  function calendarFor(mk) {
    const [y, m] = mk.split('-').map(Number)
    const daysIn = new Date(y, m, 0).getDate()
    const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7 // lunes = 0
    const byDay = {}
    const add = (d, e) => { (byDay[d] = byDay[d] || []).push(e) }
    for (const c of data.cards) {
      const l = latestByCard[c.id]
      if (!l) continue
      const name = `${c.bank || 'Banco'} ····${c.last4 || '----'}`
      for (const [key, kind] of [['cutoffDate', 'corte'], ['dueDate', 'limite']]) {
        const d = parseInt((l[key] || '').slice(8, 10), 10)
        if (d) add(Math.min(d, daysIn), { kind, name })
      }
    }
    for (const pay of data.payments) {
      if ((pay.date || '').slice(0, 7) !== mk) continue
      const c = data.cards.find((x) => x.id === pay.cardId)
      add(parseInt(pay.date.slice(8, 10), 10), { kind: 'pago', name: c ? `${c.bank || 'Banco'} ····${c.last4 || '----'}` : 'Tarjeta', amount: pay.amount })
    }
    return { y, m, daysIn, firstDow, byDay }
  }

  // Simulador "¿y si pago más?": usa tu presupuesto mensual del plan y tu estrategia
  const baseBudget = plan.mode === 'por_tarjeta' ? Object.values(plan.perCard || {}).reduce((a, v) => a + (Number(v) || 0), 0) : (plan.monthlyBudget || 0)
  const extraN = numOrNull(extra) || 0
  const simBase = planCards.length && baseBudget > 0 ? simulateTogether(planCards, baseBudget, plan.strategy) : null
  const simPlus = simBase && extraN > 0 ? simulateTogether(planCards, baseBudget + extraN, plan.strategy) : null
  const userName = (data.profile?.name || '').trim()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'

  const appStyle = {
    '--accent': appearance.accent, '--bg': appearance.bg, '--card': appearance.card, '--text': appearance.text,
    '--radius': RADIUS[appearance.radius] || '12px', '--fs': FONT_SIZE[appearance.fontSize] || '16px',
    backgroundImage: appearance.bgMode === 'foto' && appearance.bgPhoto ? `url(${appearance.bgPhoto})` : undefined,
  }
  const appClass = `app${appearance.bgMode === 'degradado' ? ' bg-degradado' : ''}${appearance.bgMode === 'dinamico' ? ' bg-dinamico' : ''}${appearance.bgMode === 'foto' ? ' bg-foto' : ''}`

  return (
    <div className={appClass} style={appStyle}>
      <div className="shell">
      <aside className="side">
        <div className="brand">💳 App TDC</div>
        <div className="greet">
          <span>{greeting}</span>
          {userName ? <b>{userName} 👋</b> : <><b>¡Bienvenido!</b><button className="link-btn" onClick={() => setTab('personalizar')}>Agregar tu nombre</button></>}
        </div>
        <nav aria-label="Secciones">
          {TABS.map(([t, icon, label]) => (
            <button key={t} className={tab === t ? 'active' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>
              <span className="opt-circle" aria-hidden>{tab === t && <i />}</span>
              <span aria-hidden>{icon}</span>
              <span>{label}</span>
              {t === 'credito' && urgent.length > 0 && <span className="badge" title="Pagos por vencer">{urgent.length}</span>}
            </button>
          ))}
        </nav>
        <button className="privacy-btn" aria-pressed={hideAmounts} onClick={() => setData({ ...data, profile: { ...(data.profile || {}), hideAmounts: !hideAmounts } })}>
          {hideAmounts ? '🙈 Montos ocultos' : '👁 Ocultar montos'}
        </button>
      </aside>
      <div className="content">
      <main>
        {notice && <div className="alert">{notice} <button className="ghost" onClick={() => setNotice('')}>Cerrar</button></div>}
        {busy && <p className="muted">{busy}</p>}

        {tab === 'dashboard' && (
          <section>
            <h2 className="page-title">Dashboard</h2>
            {!hasAnything && (
              <div className="card">
                <p>Empieza vacía, sin saldos inventados. Sube tu primer estado de cuenta y aquí verás todas tus tarjetas juntas.</p>
                <div className="row">
                  <button className="primary" onClick={() => setTab('credito')}>Subir estado de crédito</button>
                  <button className="ghost" onClick={() => setTab('debito')}>Subir estado de débito</button>
                </div>
              </div>
            )}
            {urgentBanner}
            {hasAnything && backupStale && (
              <div className="alert">💾 {lastBackup ? `Tu último respaldo fue el ${fmtBackup(lastBackup)}.` : 'Aún no has hecho un respaldo.'} Tus datos viven solo en este navegador. <button className="ghost" onClick={() => setTab('personalizar')}>Hacer respaldo</button></div>
            )}
            {hasAnything && (
              <div className="grid">
                <div className="card stat"><span>Deuda total (crédito)</span><b>{fmtMoney(totalDebt)}</b>{delta !== null && <span className={delta > 0 ? 'delta-up' : 'delta-down'}>{delta > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta))} vs mes anterior</span>}</div>
                <div className="card stat"><span>Dinero en débito</span><b>{fmtMoney(debitTotals.balance)}</b></div>
                <div className="card stat"><span>Posición neta</span><b>{fmtMoney(debitTotals.balance - totalDebt)}</b><span>débito menos deuda de crédito</span></div>
                <div className="card stat"><span>Intereses del mes</span><b>{fmtMoney(monthInterest)}</b></div>
              </div>
            )}
            {upcoming.length > 0 && (
              <div className="card">
                <h3>Próximos pagos</h3>
                {upcoming.map(({ c, s: st, days }) => (
                  <div key={c.id} className="list-row">
                    <span>{c.bank || 'Banco'} {c.product || ''} <span className="muted">····{c.last4 || '----'}</span></span>
                    <span style={{ textAlign: 'right' }}>
                      <b>{fmtMoney(st.noInterestPayment)}</b> <span className="muted">para no generar interés</span><br />
                      <span className={days < 0 ? 'muted' : days <= 5 ? 'warn' : 'muted'}>{st.dueDate} · {days < 0 ? 'fecha límite pasada' : days === 0 ? 'vence hoy' : `en ${days} día${days === 1 ? '' : 's'}`}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {data.cards.length > 0 && (
              <div className="card">
                <h3>Tarjetas de crédito ({data.cards.length})</h3>
                {data.cards.map((c) => {
                  const l = latestByCard[c.id]
                  const util = c.limit > 0 && l ? (l.balance || 0) / c.limit * 100 : 0
                  return (
                    <button key={c.id} className="mini-item" onClick={() => setTab('credito')}>
                      <span className="card-title-row">
                        <span><strong>{c.bank || 'Banco'} {c.product || ''}</strong> <span className="muted">····{c.last4 || '----'}</span></span>
                        <b>{l ? fmtMoney(l.balance) : '—'}</b>
                      </span>
                      {l && <span className="muted" style={{ display: 'block' }}>Mínimo {fmtMoney(l.minimum)} · Sin intereses {fmtMoney(l.noInterestPayment)} · Límite {l.dueDate || '—'}</span>}
                      {c.limit > 0 && l && <span className={`meter${util > 80 ? ' red' : util > 50 ? ' amber' : ''}`} style={{ display: 'block' }}><i style={{ width: `${Math.min(100, util)}%` }} /></span>}
                    </button>
                  )
                })}
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
        )}

        {tab === 'credito' && (
          <section>
            <h2 className="page-title">TDC (Crédito)</h2>
            {urgentBanner}
            <div className="card">
              <UploadZone onFiles={handleFiles} big />
              <div className="row" style={{ marginTop: 10 }}>
                <button className="ghost" onClick={() => setPending({ id: null, fileName: 'Captura manual', fileType: '', fileDataUrl: null, bank: '', product: '', last4: '', limit: '', rate: '', cat: '', balance: '', minimum: '', noInterestPayment: '', interest: '', commissions: '', cutoffDate: '', dueDate: '', detected: false, monthKey: new Date().toISOString().slice(0, 7) })}>+ Captura manual</button>
              </div>
            </div>
            {pending && <StatementForm draft={pending} onSave={saveStatement} onCancel={() => setPending(null)} />}
            {editing && <StatementForm draft={editing} onSave={saveStatement} onCancel={() => setEditing(null)} />}
            {data.cards.length === 0 && (
              <div className="card"><p>Empieza vacía, sin saldos inventados. Sube tu primer estado de cuenta en PDF o foto y la app detecta la tarjeta, el banco, el saldo, el pago mínimo, el pago para no generar intereses, los intereses y las fechas.</p>
              <p className="muted">Si el PDF viene protegido con contraseña, súbelo igual y llena los números a mano con el formulario de corrección.</p></div>
            )}
            <div className="grid">
              <div className="card stat"><span>Deuda total</span><b>{fmtMoney(totalDebt)}</b>{delta !== null && <span className={delta > 0 ? 'delta-up' : 'delta-down'}>{delta > 0 ? '▲' : '▼'} {fmtMoney(Math.abs(delta))} vs mes anterior</span>}</div>
              <div className="card stat"><span>Intereses del mes</span><b>{fmtMoney(monthInterest)}</b></div>
              <div className="card stat"><span>Uso de crédito</span><b>{totalLimit ? `${usage}%` : '—'}</b><span>{totalLimit ? `de ${fmtMoney(totalLimit)} de límite` : 'sin límite registrado'}</span></div>
              <div className="card stat"><span>Próximo vencimiento</span><b>{nextDue || '—'}</b>{nextDue && <span>Revisa el pago para no generar intereses</span>}</div>
            </div>
            {chartData.length >= 2 && (
              <div className="card">
                <h3>Gráficas mes a mes</h3>
                <p className="muted">¿Qué quieres ver?</p>
                <div className="chip-row" role="group" aria-label="Elige qué muestra la gráfica">
                  {[['saldo', 'Saldo total'], ['interes', 'Interés acumulado'], ['pagos', 'Pagos realizados']].map(([k, label]) => (
                    <button key={k} className={`chip${chartView === k ? ' active' : ''}`} aria-pressed={chartView === k} onClick={() => setChartView(k)}>
                      <span className="opt-circle" aria-hidden>{chartView === k && <i />}</span>{label}
                    </button>
                  ))}
                </div>
                {chartView === 'saldo' && <BarChart label="Saldo total mes a mes" data={chartData.map((m) => ({ label: m.label, value: m.saldo }))} />}
                {chartView === 'interes' && <BarChart label="Interés acumulado mes a mes" data={chartData.map((m) => ({ label: m.label, value: m.interesAcum }))} />}
                {chartView === 'pagos' && <BarChart label="Pagos realizados mes a mes" data={chartData.map((m) => ({ label: m.label, value: m.pagos }))} />}
                <p className="muted">{chartView === 'saldo' ? 'Así ha cambiado tu deuda total con cada estado de cuenta.' : chartView === 'interes' ? 'Todo el interés que se ha ido acumulando mes con mes, sumando los intereses de cada estado.' : 'Lo que pagaste cada mes, según los pagos que registraste en la pestaña Pagos.'}</p>
              </div>
            )}
            <div className="card">
              <h3>Mis tarjetas ({data.cards.length})</h3>
              {data.cards.length === 0 && <p className="muted">Aún no hay tarjetas.</p>}
              {data.cards.map((c) => {
                const latest = latestByCard[c.id]
                const first = firstByCard[c.id]
                const planInfo = planInfoFor({ ...c, balance: latest?.balance || 0, minimum: latest?.minimum || 0, rate: c.rate })
                const util = c.limit > 0 && latest ? (latest.balance || 0) / c.limit * 100 : 0
                const prog = first && first.balance > 0 && latest ? Math.max(0, Math.min(100, ((first.balance - latest.balance) / first.balance) * 100)) : 0
                return (
                  <article key={c.id} style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 0' }}>
                    <div className="card-title-row">
                      <div><strong>{c.bank || 'Banco'} {c.product || ''}</strong> <span className="muted">****{c.last4 || '----'}</span><br />
                      <span className="muted">Tasa: {c.rate ? `${c.rate}%` : '—'}{c.cat ? ` · CAT ${c.cat}%` : ''}</span></div>
                      <div style={{ textAlign: 'right' }}><span className="muted" style={{ fontSize: '.8em' }}>Restante a pagar</span><br /><b style={{ fontSize: '1.2em' }}>{latest ? fmtMoney(latest.balance) : '—'}</b></div>
                    </div>
                    {latest ? (
                      <>
                        <div className="plan-box">
                          {planInfo ? (
                            <>
                              <p className="muted" style={{ margin: 0, fontWeight: 600 }}>🎯 Pago recomendado según tu plan</p>
                              <p className="rec">{fmtMoney(planInfo.recommended)} <span style={{ fontSize: '.7em' }}>/mes</span></p>
                              <p className="muted" style={{ margin: '2px 0 0' }}>{planInfo.note}</p>
                            </>
                          ) : (
                            <>
                              <p className="muted" style={{ margin: 0, fontWeight: 600 }}>🎯 Pago recomendado según tu plan</p>
                              <p style={{ margin: '4px 0 0', fontWeight: 600 }}>Todavía no defines tu plan para esta tarjeta.</p>
                              <button className="ghost" style={{ marginTop: 8 }} onClick={() => setTab('plan')}>Crear mi plan para liquidar →</button>
                            </>
                          )}
                        </div>
                        <div className="mini-grid">
                          <div><span>Para no generar interés</span><b>{fmtMoney(latest.noInterestPayment)}</b></div>
                          <div><span>Interés de este mes</span><b>{fmtMoney(latest.interest)}</b></div>
                          <div><span>Pago mínimo</span><b>{fmtMoney(latest.minimum)}</b></div>
                        </div>
                        <p className="muted" style={{ marginTop: 10 }}>✂️ Fecha de corte: <strong>{latest.cutoffDate || '—'}</strong> · 📅 Fecha límite: <strong>{latest.dueDate || '—'}</strong></p>
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9em' }}><span className="muted">Uso de la tarjeta</span><b>{Math.round(util)}%{c.limit ? ` de ${fmtMoney(c.limit)}` : ''}</b></div>
                          <div className={`meter${util > 80 ? ' red' : util > 50 ? ' amber' : ''}`}><i style={{ width: `${Math.min(100, util)}%` }} /></div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9em' }}><span className="muted">Avance para terminar de pagarla</span><b>{Math.round(prog)}%</b></div>
                          <div className="meter"><i style={{ width: `${Math.min(100, prog)}%` }} /></div>
                          <p className="muted" style={{ margin: '4px 0 0' }}>{prog > 0 ? `Tu saldo bajó ${Math.round(prog)}% desde tu primer estado registrado. Te falta el ${Math.round(100 - prog)}%.` : 'Este avance se calcula comparando tu saldo actual con el de tu primer estado registrado.'}</p>
                        </div>
                      </>
                    ) : <p className="muted">Aún sin estados de cuenta. Súbelo arriba o usa «Captura manual».</p>}
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Historial de estados ({data.statements.filter((x) => x.cardId === c.id).length})</summary>
                      <div style={{ overflowX: 'auto' }}>
                        <table><thead><tr><th>Mes</th><th>Saldo</th><th>Mínimo</th><th>Intereses</th><th>Vence</th><th>Archivo</th><th></th></tr></thead>
                        <tbody>
                          {data.statements.filter((x) => x.cardId === c.id).sort((x, y) => (y.monthKey || '').localeCompare(x.monthKey || '')).map((st) => (
                            <tr key={st.id}>
                              <td>{fmtMonth(st.monthKey)}</td><td>{fmtMoney(st.balance)}</td><td>{fmtMoney(st.minimum)}</td><td>{fmtMoney(st.interest)}</td><td>{st.dueDate || '—'}</td>
                              <td>{st.fileDataUrl ? <a href={st.fileDataUrl} target="_blank" rel="noreferrer">Ver archivo</a> : <span className="muted">{st.fileName || '—'}</span>}</td>
                              <td><button className="ghost" onClick={() => setEditing({ ...st, detected: true })}>Corregir</button>{' '}<button className="danger" onClick={() => deleteStatement(st.id)}>Eliminar</button></td>
                            </tr>
                          ))}
                        </tbody></table>
                      </div>
                    </details>
                    <div className="row" style={{ marginTop: 10 }}>
                      <button className="danger" onClick={() => deleteCard(c.id)}>Eliminar tarjeta</button>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'calendario' && (() => {
          const cal = calendarFor(calMonth)
          const cells = []
          for (let i = 0; i < cal.firstDow; i++) cells.push(null)
          for (let d = 1; d <= cal.daysIn; d++) cells.push(d)
          const todayDay = calMonth === todayStr.slice(0, 7) ? parseInt(todayStr.slice(8, 10), 10) : -1
          const shiftMonth = (n) => { const dt = new Date(cal.y, cal.m - 1 + n, 1); setCalMonth(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`) }
          const icon = { corte: '✂️', limite: '📅', pago: '💵' }
          const label = { corte: 'Fecha de corte', limite: 'Fecha límite de pago', pago: 'Pago registrado' }
          const days = Object.keys(cal.byDay).map(Number).sort((a, b) => a - b)
          return (
            <section>
              <h2 className="page-title">Calendario</h2>
              <div className="card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <button className="ghost" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">‹</button>
                  <strong style={{ textTransform: 'capitalize' }}>{new Date(cal.y, cal.m - 1, 1).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}</strong>
                  <button className="ghost" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">›</button>
                </div>
                <div className="cal" style={{ marginTop: 12 }}>
                  {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i} className="head">{d}</div>)}
                  {cells.map((d, i) => d === null ? <div key={i} /> : (
                    <div key={i} className={`cell${d === todayDay ? ' today' : ''}`}>
                      <b>{d}</b>
                      <div>{(cal.byDay[d] || []).map((e, j) => <span key={j} title={`${label[e.kind]} · ${e.name}`}>{icon[e.kind]}</span>)}</div>
                    </div>
                  ))}
                </div>
                <p className="muted" style={{ marginTop: 10 }}>✂️ corte · 📅 fecha límite · 💵 pago registrado. Las fechas de corte y límite se repiten cada mes según el día de tu último estado de cuenta.</p>
              </div>
              <div className="card">
                <h3>Este mes</h3>
                {days.length === 0 && <p className="muted">{data.cards.length === 0 ? 'Sube un estado de cuenta para ver tus fechas aquí.' : 'No hay fechas ni pagos registrados este mes.'}</p>}
                {days.map((d) => cal.byDay[d].map((e, j) => (
                  <div key={`${d}-${j}`} className="list-row">
                    <span>{icon[e.kind]} Día {d} · {label[e.kind]}</span>
                    <span style={{ textAlign: 'right' }}>{e.name}{e.kind === 'pago' ? <> · <b>{fmtMoney(e.amount)}</b></> : null}</span>
                  </div>
                )))}
              </div>
            </section>
          )
        })()}

        {tab === 'plan' && (
          <section>
            <div className="card">
              <h3>Plan para liquidar</h3>
              <div className="chip-row" role="group" aria-label="Modo del plan">
                {[['juntas', 'Todas juntas'], ['por_tarjeta', 'Por tarjeta']].map(([k, label]) => (
                  <button key={k} className={`chip${plan.mode === k ? ' active' : ''}`} aria-pressed={plan.mode === k} onClick={() => setPlan({ mode: k })}>
                    <span className="opt-circle" aria-hidden>{plan.mode === k && <i />}</span>{label}
                  </button>
                ))}
              </div>
              {planCards.length === 0 && <p className="muted">Sube primero un estado de cuenta para armar el plan.</p>}
              {plan.mode === 'juntas' && planCards.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <label>Estrategia</label>
                  <select value={plan.strategy} onChange={(e) => setPlan({ strategy: e.target.value })}>
                    <option value="avalanche">Avalancha — primero la de mayor tasa</option>
                    <option value="snowball">Bola de nieve — primero la de menor saldo</option>
                  </select>
                  <label>Pago mensual total ($)</label>
                  <input type="number" min="0" value={plan.monthlyBudget || ''} onChange={(e) => setPlan({ monthlyBudget: parseFloat(e.target.value) || 0 })} placeholder="Ej. 5000" />
                  {together && (
                    <div style={{ marginTop: 12 }}>
                      {together.feasible ? (
                        <p>Libre de deuda en <strong>{together.months} meses</strong> ({together.payoffDate ? fmtMonth(together.payoffDate) : ''}) · Intereses totales: <strong>{fmtMoney(together.totalInterest)}</strong> · Total pagado: {fmtMoney(together.totalPaid)}</p>
                      ) : <p className="warn">Con ese pago mensual no se liquidan: el pago no cubre ni los intereses. Sube el pago mensual.</p>}
                      {minimumsOnly && <p className="muted">Pagando solo los mínimos: {minimumsOnly.months} meses y {fmtMoney(minimumsOnly.totalInterest)} de intereses. Ahorro con tu plan: <strong className="ok">{fmtMoney(Math.max(0, minimumsOnly.totalInterest - (together.totalInterest || 0)))}</strong></p>}
                    </div>
                  )}
                </div>
              )}
              {plan.mode === 'por_tarjeta' && planCards.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {perCardSim.map(({ card, sim }) => (
                    <div key={card.id} className="card" style={{ border: '1px solid #e2e8f0' }}>
                      <strong>{card.bank || 'Banco'} {card.product || ''} ****{card.last4 || '----'}</strong>
                      <span className="muted"> · Saldo {fmtMoney(card.balance)} · Mínimo {fmtMoney(card.minimum)}</span>
                      <label>¿Cuánto pagas al mes a esta tarjeta? ($)</label>
                      <input type="number" min="0" value={plan.perCard[card.id] || ''} onChange={(e) => setPlan({ perCard: { ...plan.perCard, [card.id]: parseFloat(e.target.value) || 0 } })} placeholder="Ej. 2000" />
                      {(plan.perCard[card.id] || 0) > 0 && (plan.perCard[card.id] || 0) < (card.minimum || 0) && <p className="warn">⚠ Este monto está debajo del pago mínimo ({fmtMoney(card.minimum)}). Paga al menos el mínimo para no generar recargos.</p>}
                      {sim.feasible && (plan.perCard[card.id] || 0) > 0 ? (
                        <p>Se liquida en <strong>{sim.months} meses</strong> ({sim.payoffDate ? fmtMonth(sim.payoffDate) : ''}) · Intereses: {fmtMoney(sim.totalInterest)}</p>
                      ) : (plan.perCard[card.id] || 0) > 0 ? <p className="warn">Con ese pago no se liquida: no cubre los intereses.</p> : null}
                    </div>
                  ))}
                  <p><strong>Total combinado:</strong> {fmtMoney(perCardSim.reduce((a, x) => a + (x.sim.totalInterest || 0), 0))} de intereses en total · Libre de deuda en {Math.max(...perCardSim.map((x) => x.sim.months || 0), 0)} meses (la que más tarda).</p>
                  {minimumsOnly && <p className="muted">Pagando solo los mínimos pagarías {fmtMoney(minimumsOnly.totalInterest)} de intereses. Ahorro con tu plan por tarjeta: <strong className="ok">{fmtMoney(Math.max(0, minimumsOnly.totalInterest - perCardSim.reduce((a, x) => a + (x.sim.totalInterest || 0), 0)))}</strong></p>}
                </div>
              )}
            </div>
            <div className="card">
              <h3>¿Y si pago más?</h3>
              {!simBase && <p className="muted">Define primero tu pago mensual en el plan para ver cuánto cambia si pagas un poco más cada mes.</p>}
              {simBase && (
                <>
                  <p className="muted">Se calcula con tu pago mensual actual de {fmtMoney(baseBudget)} y tu estrategia ({plan.strategy === 'snowball' ? 'bola de nieve' : 'avalancha'}), repartido entre todas tus tarjetas.</p>
                  <label>Pago extra al mes ($)</label>
                  <input type="number" min="0" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ej. 1000" />
                  <div className="chip-row">
                    {[500, 1000, 2000, 5000].map((v) => <button key={v} className="chip" onClick={() => setExtra(String(v))}>+{fmtMoney(v)}</button>)}
                  </div>
                  <div className="mini-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                    <div><span>Como vas hoy</span><b>{simBase.feasible ? `${simBase.months} meses` : 'No se liquida'}</b><span>Intereses: {fmtMoney(simBase.totalInterest)}</span></div>
                    <div><span>Con {extraN > 0 ? `+${fmtMoney(extraN)}` : 'el extra'}</span><b>{simPlus ? (simPlus.feasible ? `${simPlus.months} meses` : 'No se liquida') : '—'}</b><span>Intereses: {simPlus ? fmtMoney(simPlus.totalInterest) : '—'}</span></div>
                  </div>
                  {simPlus && simBase.feasible && simPlus.feasible && (
                    <p style={{ marginTop: 12 }}>💡 Terminarías <b>{Math.max(0, simBase.months - simPlus.months)} {simBase.months - simPlus.months === 1 ? 'mes' : 'meses'} antes</b> ({fmtMonth(simPlus.payoffDate)}) y te ahorrarías <b>{fmtMoney(Math.max(0, simBase.totalInterest - simPlus.totalInterest))}</b> en intereses.</p>
                  )}
                  <p className="muted">Es una simulación educativa con interés mensual simple; los números reales de tu banco pueden variar.</p>
                </>
              )}
            </div>
          </section>
        )}

        {tab === 'pagos' && (
          <section>
            <div className="card">
              <h3>Registrar un pago</h3>
              <PaymentForm cards={planCards} onAdd={(p) => setData({ ...data, payments: [...data.payments, p] })} />
            </div>
            <div className="card">
              <h3>Pagos registrados</h3>
              {data.payments.length === 0 && <p className="muted">Aún no hay pagos registrados.</p>}
              {[...data.payments].reverse().map((p) => {
                const card = data.cards.find((c) => c.id === p.cardId)
                const target = plan.mode === 'por_tarjeta' ? (plan.perCard[p.cardId] || 0) : (latestByCard[p.cardId]?.minimum || 0)
                return (
                  <div key={p.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '8px 0' }}>
                    <div><strong>{fmtMoney(p.amount)}</strong> — {card ? `${card.bank || ''} ****${card.last4 || ''}` : 'Tarjeta'} · {p.date} {p.note ? `· ${p.note}` : ''}<br />
                    <span className="muted">Meta del plan: {fmtMoney(target)} {target ? (p.amount >= target ? '· ✅ cumplida' : '· ⚠ por debajo de la meta') : ''}</span></div>
                    <button className="danger" onClick={() => setData({ ...data, payments: data.payments.filter((x) => x.id !== p.id) })}>Eliminar</button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'debito' && (
          <section>
            <h2 className="page-title">TDD (Débito)</h2>
            <div className="card">
              <UploadZone onFiles={handleDebitFiles} big
                label="🏦 Subir estado de débito (PDF o foto)"
                hint="Arrastra aquí o toca para elegir. La app detecta el banco, la cuenta por sus últimos 4 dígitos, el saldo final, cuánto entró, cuánto salió y las comisiones." />
            </div>
            {debitPending && <DebitStatementForm draft={debitPending} onSave={saveDebitStatement} onCancel={() => setDebitPending(null)} />}
            {debitEditing && <DebitStatementForm draft={debitEditing} onSave={saveDebitStatement} onCancel={() => setDebitEditing(null)} />}
            {!debitPending && !debitEditing && data.debitAccounts.length === 0 && (
              <div className="card"><p>Empieza vacía, sin saldos inventados. Sube tu primer estado de débito en PDF o foto y la app detecta la cuenta sola, sin duplicarla mes a mes.</p>
              <p className="muted">Si el PDF viene protegido con contraseña, súbelo igual y llena los números a mano con el formulario de corrección.</p></div>
            )}
            {!debitPending && !debitEditing && data.debitAccounts.length > 0 && (
              <>
                <div className="card">
                  <span className="muted">Tu dinero en débito (último estado de cada cuenta)</span>
                  <p style={{ fontSize: '1.6em', fontWeight: 800, margin: '4px 0' }}>{fmtMoney(debitTotals.balance)}</p>
                  <div className="grid">
                    <div className="card stat" style={{ marginBottom: 0 }}><span>Entró en el mes</span><b>{fmtMoney(debitTotals.income)}</b></div>
                    <div className="card stat" style={{ marginBottom: 0 }}><span>Salió en el mes</span><b>{fmtMoney(debitTotals.expenses)}</b></div>
                    <div className="card stat" style={{ marginBottom: 0 }}><span>Te quedó (neto)</span><b>{fmtMoney(debitTotals.net)}</b></div>
                    <div className="card stat" style={{ marginBottom: 0 }}><span>Comisiones{debitTotals.earned > 0 ? ' · Rendimientos' : ''}</span><b>{fmtMoney(debitTotals.fees)}{debitTotals.earned > 0 ? ` · +${fmtMoney(debitTotals.earned)}` : ''}</b></div>
                  </div>
                  {debitTotals.income > 0 && (
                    <p style={{ marginTop: 12 }}>{debitTotals.net >= 0
                      ? `💰 Este mes te quedó el ${Math.round((debitTotals.net / debitTotals.income) * 100)}% de lo que entró. Gastaste ${fmtMoney(debitTotals.expenses)} de ${fmtMoney(debitTotals.income)}.`
                      : `⚠️ Este mes salió ${fmtMoney(Math.abs(debitTotals.net))} más de lo que entró.`}</p>
                  )}
                </div>
                {debitHistory.length >= 2 && (
                  <div className="card">
                    <h3>Tu débito mes a mes</h3>
                    <p className="muted">¿Qué quieres ver?</p>
                    <div className="chip-row" role="group" aria-label="Elige qué muestra la gráfica de débito">
                      {[['saldo', 'Saldo final'], ['flujo', 'Entró vs salió'], ['ahorro', '% que te quedó']].map(([k, label]) => (
                        <button key={k} className={`chip${debitChartView === k ? ' active' : ''}`} aria-pressed={debitChartView === k} onClick={() => setDebitChartView(k)}>
                          <span className="opt-circle" aria-hidden>{debitChartView === k && <i />}</span>{label}
                        </button>
                      ))}
                    </div>
                    {debitChartView === 'saldo' && <BarChart label="Saldo final mes a mes" data={debitHistory.map((m) => ({ label: m.label, value: m.saldo }))} />}
                    {debitChartView === 'flujo' && (
                      <div>
                        <BarChart label="Entró mes a mes" data={debitHistory.map((m) => ({ label: m.label, value: m.ingresos }))} />
                        <div style={{ height: 16 }} />
                        <BarChart label="Salió mes a mes" data={debitHistory.map((m) => ({ label: m.label, value: m.gastos }))} />
                      </div>
                    )}
                    {debitChartView === 'ahorro' && <BarChart label="% que te quedó mes a mes" data={debitHistory.map((m) => ({ label: m.label, value: m.ahorro }))} />}
                    <p className="muted">{debitChartView === 'saldo' ? 'Así ha cambiado el saldo final de tus cuentas de débito con cada estado.' : debitChartView === 'flujo' ? 'Lo que entró (depósitos y abonos) contra lo que salió (cargos, compras y retiros) cada mes.' : 'De cada peso que entró, qué porcentaje te quedó al final del mes. Si sale negativo, gastaste más de lo que entró.'}</p>
                  </div>
                )}
                {data.debitAccounts.map((a) => {
                  const l = latestByAccount[a.id]
                  const list = data.debitStatements.filter((s) => s.accountId === a.id).sort((x, y) => (y.monthKey || '').localeCompare(x.monthKey || ''))
                  const prev = list[1]
                  const d = l && prev ? (l.closingBalance || 0) - (prev.closingBalance || 0) : null
                  const net = l ? (l.totalIncome || 0) - (l.totalExpenses || 0) : 0
                  const spentPct = l && (l.totalIncome || 0) > 0 ? Math.round(((l.totalExpenses || 0) / l.totalIncome) * 100) : 0
                  return (
                    <div key={a.id} className="card">
                      <div className="card-title-row">
                        <div><strong>{a.bank || 'Banco'} · {a.name || 'Cuenta de débito'}</strong><br /><span className="muted">Débito •••• {a.last4 || '—'}</span></div>
                        <div style={{ textAlign: 'right' }}><span className="muted" style={{ fontSize: '.8em' }}>Saldo final</span><br /><b style={{ fontSize: '1.2em' }}>{l ? fmtMoney(l.closingBalance) : '—'}</b>
                        {d !== null && <div style={{ fontSize: '.85em', fontWeight: 600, color: d >= 0 ? '#067647' : '#b42318' }}>{d >= 0 ? '▲ Subió ' : '▼ Bajó '}{fmtMoney(Math.abs(d))} vs mes anterior</div>}</div>
                      </div>
                      {l ? (
                        <>
                          <div className="mini-grid">
                            <div><span>Entró</span><b>{fmtMoney(l.totalIncome)}</b></div>
                            <div><span>Salió</span><b>{fmtMoney(l.totalExpenses)}</b></div>
                            <div><span>Te quedó</span><b>{fmtMoney(net)}</b></div>
                          </div>
                          <p className="muted" style={{ marginTop: 10 }}>
                            Estado: <strong>{fmtMonth(l.monthKey)}</strong>
                            {l.cutoffDate ? <> · ✂️ Corte: <strong>{l.cutoffDate}</strong></> : null}
                            {(l.fees || 0) > 0 ? <> · Comisiones: <strong>{fmtMoney(l.fees)}</strong></> : null}
                            {(l.interestEarned || 0) > 0 ? <> · Rendimientos: <strong>+{fmtMoney(l.interestEarned)}</strong></> : null}
                          </p>
                          {(l.totalIncome || 0) > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9em' }}><span className="muted">De lo que entró, gastaste</span><b>{Math.min(999, spentPct)}%</b></div>
                              <div className={`meter${(l.totalExpenses || 0) > (l.totalIncome || 0) ? ' red' : ''}`}><i style={{ width: `${Math.min(100, spentPct)}%` }} /></div>
                            </div>
                          )}
                          {(l.categories || []).length > 0 && (
                            <div style={{ marginTop: 10 }}>
                              <h4>Gastos por categoría</h4>
                              {[...l.categories].sort((x, y) => y.amount - x.amount).map((c) => {
                                const tot = l.categories.reduce((a, x) => a + x.amount, 0)
                                const pct = tot > 0 ? Math.round((c.amount / tot) * 100) : 0
                                return (
                                  <div key={c.name} style={{ marginBottom: 6 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.9em' }}><span>{c.name}</span><b>{fmtMoney(c.amount)} · {pct}%</b></div>
                                    <div className="meter"><i style={{ width: `${pct}%` }} /></div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {(l.largestExpense || 0) > 0 && <p className="muted" style={{ marginTop: 8 }}>Mayor gasto del mes: <strong>{fmtMoney(l.largestExpense)}</strong>{l.largestExpenseDesc ? ` · ${l.largestExpenseDesc}` : ''}</p>}
                        </>
                      ) : <p className="muted">Aún sin estados de débito.</p>}
                      <div className="row" style={{ marginTop: 10 }}>
                        <button className="ghost" onClick={() => { setDebitPending({ id: null, fileName: 'Captura manual', fileType: '', fileDataUrl: null, bank: a.bank || '', name: a.name || '', last4: a.last4 || '', closingBalance: '', totalIncome: '', totalExpenses: '', fees: '', interestEarned: '', largestExpense: '', largestExpenseDesc: '', categories: [], cutoffDate: '', detected: false, monthKey: new Date().toISOString().slice(0, 7) }) }}>+ Agregar estado de esta cuenta</button>
                        <button className="danger" onClick={() => deleteDebitAccount(a.id)}>Eliminar cuenta</button>
                      </div>
                      {list.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <h4>Historial</h4>
                          <table><thead><tr><th>Mes</th><th>Saldo final</th><th>Entró</th><th>Salió</th><th>Archivo</th><th></th></tr></thead>
                          <tbody>
                            {list.map((s) => (
                              <tr key={s.id}>
                                <td>{fmtMonth(s.monthKey)}</td><td>{fmtMoney(s.closingBalance)}</td><td>{fmtMoney(s.totalIncome)}</td><td>{fmtMoney(s.totalExpenses)}</td>
                                <td>{s.fileDataUrl ? <a href={s.fileDataUrl} target="_blank" rel="noreferrer">Ver archivo</a> : <span className="muted">{s.fileName || '—'}</span>}</td>
                                <td><button className="ghost" onClick={() => setDebitEditing({ ...s, categories: s.categories || [], bank: a.bank, name: a.name, last4: a.last4, detected: true })}>Corregir</button>{' '}<button className="danger" onClick={() => deleteDebitStatement(s.id)}>Eliminar</button></td>
                              </tr>
                            ))}
                          </tbody></table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </section>
        )}

        {tab === 'personalizar' && (
          <section>
            <div className="card">
              <h3>👤 Tu nombre</h3>
              <label>Así te saluda la barra lateral</label>
              <input value={data.profile?.name || ''} maxLength={40} placeholder="Tu nombre"
                onChange={(e) => setData({ ...data, profile: { ...(data.profile || {}), name: e.target.value } })} />
            </div>
            <div className="card">
              <h3>💾 Respaldo de tus datos</h3>
              <p className="muted">Tus datos viven solo en este navegador. Descarga un respaldo para no perderlos si borras los datos del navegador o cambias de equipo. {lastBackup ? `Último respaldo: ${fmtBackup(lastBackup)}.` : 'Todavía no has hecho uno.'}</p>
              <div className="row">
                <button className="primary" onClick={exportBackup}>Descargar respaldo</button>
                <button className="ghost" onClick={() => backupRef.current?.click()}>Restaurar desde respaldo</button>
                <input ref={backupRef} type="file" accept="application/json,.json" style={{ display: 'none' }}
                  onChange={(e) => { importBackup(e.target.files[0]); e.target.value = '' }} />
              </div>
              <p className="muted">El archivo incluye tus estados de cuenta subidos y tus datos personales: guárdalo en un lugar seguro. Al restaurar se reemplazan los datos actuales.</p>
            </div>
            <div className="card">
              <h3>🎨 Personalizar</h3>
              <label>Tema</label>
              <div className="theme-grid">
                {Object.entries(THEMES).map(([key, t]) => (
                  <div key={key} className={`theme-swatch${data.appearance.theme === key ? ' sel' : ''}`} style={{ background: t.bg, color: t.text }} onClick={() => setData({ ...data, appearance: { ...data.appearance, theme: key, accent: '', bg: '', card: '', text: '' } })}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: t.accent, margin: '0 auto 6px' }} />{t.label}
                  </div>
                ))}
              </div>
              <label>Modo</label>
              <select value={data.appearance.mode} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, mode: e.target.value } })}>
                <option value="auto">Automático (según el teléfono)</option>
                <option value="claro">Claro</option>
                <option value="noche">Noche</option>
              </select>
              <div className="grid">
                <div><label>Color principal</label><input type="color" value={appearance.accent} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, accent: e.target.value } })} /></div>
                <div><label>Fondo</label><input type="color" value={appearance.bg} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, bg: e.target.value } })} /></div>
                <div><label>Tarjetas</label><input type="color" value={appearance.card} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, card: e.target.value } })} /></div>
                <div><label>Texto</label><input type="color" value={appearance.text} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, text: e.target.value } })} /></div>
              </div>
              <label>Fondo</label>
              <select value={data.appearance.bgMode} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, bgMode: e.target.value } })}>
                <option value="solido">Sólido</option>
                <option value="degradado">Degradado</option>
                <option value="dinamico">Dinámico animado</option>
                <option value="foto">Mi foto de fondo</option>
              </select>
              {data.appearance.bgMode === 'foto' && (
                <div style={{ marginTop: 8 }}>
                  <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { const url = await fileToDataUrl(f); setData({ ...data, appearance: { ...data.appearance, bgPhoto: url } }) } }} />
                  {data.appearance.bgPhoto && <p className="muted">Foto cargada. <button className="ghost" onClick={() => setData({ ...data, appearance: { ...data.appearance, bgPhoto: null } })}>Quitar foto</button></p>}
                </div>
              )}
              <div className="grid">
                <div><label>Esquinas</label>
                  <select value={data.appearance.radius} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, radius: e.target.value } })}>
                    <option value="suave">Suaves</option><option value="redondo">Muy redondas</option><option value="recto">Rectas</option>
                  </select></div>
                <div><label>Tamaño de letra</label>
                  <select value={data.appearance.fontSize} onChange={(e) => setData({ ...data, appearance: { ...data.appearance, fontSize: e.target.value } })}>
                    <option value="chica">Chica</option><option value="mediana">Mediana</option><option value="grande">Grande</option>
                  </select></div>
              </div>
              <p className="muted">Todo se guarda automáticamente y se aplica en toda la app.</p>
              <button className="ghost" onClick={() => setData({ ...data, appearance: { ...DEFAULT_APPEARANCE } })}>Restablecer diseño</button>
            </div>
          </section>
        )}
      </main>
      <footer>App TDC v2.4 · Tus datos se guardan solo en tu navegador (localStorage). No se suben a ningún servidor. El plan es una simulación educativa, no asesoría financiera.</footer>
      </div>
      </div>
    </div>
  )
}

function PaymentForm({ cards, onAdd }) {
  const [cardId, setCardId] = useState(cards[0]?.id || '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  useEffect(() => { if (!cardId && cards[0]) setCardId(cards[0].id) }, [cards])
  if (!cards.length) return <p className="muted">Sube primero un estado de cuenta.</p>
  return (
    <div>
      <label>Tarjeta</label>
      <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
        {cards.map((c) => <option key={c.id} value={c.id}>{c.bank || 'Banco'} ****{c.last4 || '----'} — saldo {fmtMoney(c.balance)}</option>)}
      </select>
      <div className="grid">
        <div><label>Monto pagado ($)</label><input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div><label>Fecha</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
      <label>Nota (opcional)</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Pago de noviembre" />
      <div style={{ marginTop: 12 }}>
        <button className="primary" onClick={() => { if (!amount || !cardId) return; onAdd({ id: uid(), cardId, amount: parseFloat(amount), date, note }); setAmount(''); setNote('') }}>Registrar pago</button>
      </div>
    </div>
  )
}

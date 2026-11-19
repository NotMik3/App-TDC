import React, { useEffect, useMemo, useRef, useState } from 'react'
import { extractPdfText, parseStatementText, monthKeyFromDate } from './lib/parse.js'
import { simulateCard, simulateTogether, simulateMinimumsOnly, fmtMoney, fmtMonth } from './lib/plan.js'
import { THEMES, DEFAULT_APPEARANCE, resolveAppearance, RADIUS, FONT_SIZE } from './lib/themes.js'

const LS_KEY = 'app-tdc-v1'
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const emptyData = () => ({ cards: [], statements: [], payments: [], plan: { mode: 'juntas', strategy: 'avalanche', monthlyBudget: 0, perCard: {} }, appearance: { ...DEFAULT_APPEARANCE } })

function useStored() {
  const [data, setData] = useState(() => {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? { ...emptyData(), ...JSON.parse(raw) } : emptyData() } catch { return emptyData() }
  })
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {} }, [data])
  return [data, setData]
}

const money = (v) => (v === '' || v === null || v === undefined ? '' : v)
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
            <input type={k === 'cutoffDate' || k === 'dueDate' ? 'date' : k === 'last4' ? 'text' : 'text'}
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

function UploadZone({ onFiles, big }) {
  const [drag, setDrag] = useState(false)
  const ref = useRef(null)
  return (
    <div className={`dropzone${drag ? ' drag' : ''}`}
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); onFiles(e.dataTransfer.files) }}>
      <div style={{ fontSize: big ? '1.2em' : '1em' }}>📄 Subir estado de cuenta (PDF o foto)</div>
      <div className="muted">Arrastra aquí o toca para elegir. Puedes subir varios meses de una vez.</div>
      <input ref={ref} type="file" accept=".pdf,image/*" multiple style={{ display: 'none' }}
        onChange={(e) => { onFiles(e.target.files); e.target.value = '' }} />
    </div>
  )
}

export default function App() {
  const [data, setData] = useStored()
  const [tab, setTab] = useState('resumen')
  const [pending, setPending] = useState(null) // draft de estado por confirmar
  const [editing, setEditing] = useState(null) // statement en corrección
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const appearance = resolveAppearance(data.appearance)

  const latestByCard = useMemo(() => {
    const map = {}
    for (const s of data.statements) {
      if (!map[s.cardId] || (s.monthKey || '') >= (map[s.cardId].monthKey || '')) map[s.cardId] = s
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
        setTab('estados')
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
      // Actualiza datos de la tarjeta con lo nuevo del estado
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
    setTab('resumen')
  }

  function deleteStatement(id) { if (confirm('¿Eliminar este estado de cuenta?')) setData({ ...data, statements: data.statements.filter((s) => s.id !== id) }) }
  function deleteCard(id) {
    if (!confirm('¿Eliminar esta tarjeta y sus estados?')) return
    setData({ ...data, cards: data.cards.filter((c) => c.id !== id), statements: data.statements.filter((s) => s.cardId !== id), payments: data.payments.filter((p) => p.cardId !== id) })
  }

  const planCards = data.cards.map((c) => ({ ...c, balance: latestByCard[c.id]?.balance || 0, minimum: latestByCard[c.id]?.minimum || 0 }))
  const plan = data.plan
  const setPlan = (patch) => setData({ ...data, plan: { ...plan, ...patch } })
  const together = planCards.length ? simulateTogether(planCards, plan.monthlyBudget || 0, plan.strategy) : null
  const minimumsOnly = planCards.length ? simulateMinimumsOnly(planCards) : null
  const perCardSim = planCards.map((c) => ({ card: c, sim: simulateCard({ balance: c.balance, rate: c.rate, minimum: c.minimum, monthlyPayment: plan.perCard[c.id] || 0 }) }))

  const appStyle = {
    '--accent': appearance.accent, '--bg': appearance.bg, '--card': appearance.card, '--text': appearance.text,
    '--radius': RADIUS[appearance.radius] || '12px', '--fs': FONT_SIZE[appearance.fontSize] || '16px',
    backgroundImage: appearance.bgMode === 'foto' && appearance.bgPhoto ? `url(${appearance.bgPhoto})` : undefined,
  }
  const appClass = `app${appearance.bgMode === 'degradado' ? ' bg-degradado' : ''}${appearance.bgMode === 'dinamico' ? ' bg-dinamico' : ''}${appearance.bgMode === 'foto' ? ' bg-foto' : ''}`

  return (
    <div className={appClass} style={appStyle}>
      <header className="top">
        <h1>💳 App TDC</h1>
        <p>Analiza tus estados de cuenta mes a mes y arma tu plan para liquidar tus tarjetas.</p>
      </header>
      <nav className="tabs">
        {['resumen', 'estados', 'plan', 'pagos', 'personalizar'].map((t) => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {t === 'resumen' ? 'Resumen' : t === 'estados' ? 'Estados' : t === 'plan' ? 'Plan para liquidar' : t === 'pagos' ? 'Pagos' : '🎨 Personalizar'}
          </button>
        ))}
      </nav>
      <main>
        {notice && <div className="alert">{notice} <button className="ghost" onClick={() => setNotice('')}>Cerrar</button></div>}
        {busy && <p className="muted">{busy}</p>}

        {tab === 'resumen' && (
          <section>
            <div className="card"><UploadZone onFiles={handleFiles} big /></div>
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
            {monthTotals.length > 0 && (
              <div className="card">
                <BarChart label="Saldo mes a mes" data={monthTotals.map((m) => ({ label: fmtMonth(m.month), value: m.balance }))} />
                <div style={{ height: 16 }} />
                <BarChart label="Intereses mes a mes" data={monthTotals.map((m) => ({ label: fmtMonth(m.month), value: m.interest }))} />
              </div>
            )}
            <div className="card">
              <h3>Mis tarjetas ({data.cards.length})</h3>
              {data.cards.length === 0 && <p className="muted">Aún no hay tarjetas.</p>}
              {data.cards.map((c) => (
                <div key={c.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '8px 0' }}>
                  <div><strong>{c.bank || 'Banco'} {c.product || ''}</strong> <span className="muted">****{c.last4 || '----'}</span><br />
                  <span className="muted">Saldo: {fmtMoney(latestByCard[c.id]?.balance)} · Mínimo: {fmtMoney(latestByCard[c.id]?.minimum)} · Tasa: {c.rate ? `${c.rate}%` : '—'}</span></div>
                  <button className="danger" onClick={() => deleteCard(c.id)}>Eliminar</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'estados' && (
          <section>
            <div className="card"><UploadZone onFiles={handleFiles} /></div>
            {pending && <StatementForm draft={pending} onSave={saveStatement} onCancel={() => setPending(null)} />}
            {editing && <StatementForm draft={editing} onSave={saveStatement} onCancel={() => setEditing(null)} />}
            {!pending && !editing && (
              <div className="card">
                <h3>Historial de estados</h3>
                <button className="ghost" onClick={() => setPending({ id: null, fileName: 'Captura manual', fileType: '', fileDataUrl: null, bank: '', product: '', last4: '', limit: '', rate: '', cat: '', balance: '', minimum: '', noInterestPayment: '', interest: '', commissions: '', cutoffDate: '', dueDate: '', detected: false, monthKey: new Date().toISOString().slice(0, 7) })}>+ Captura manual</button>
                {data.statements.length === 0 && <p className="muted">Aún no hay estados de cuenta.</p>}
                {data.cards.map((c) => (
                  <div key={c.id} style={{ marginTop: 16 }}>
                    <h4>{c.bank || 'Banco'} {c.product || ''} ****{c.last4 || '----'}</h4>
                    <table><thead><tr><th>Mes</th><th>Saldo</th><th>Mínimo</th><th>Intereses</th><th>Vence</th><th>Archivo</th><th></th></tr></thead>
                    <tbody>
                      {data.statements.filter((s) => s.cardId === c.id).sort((a, b) => (b.monthKey || '').localeCompare(a.monthKey || '')).map((s) => (
                        <tr key={s.id}>
                          <td>{fmtMonth(s.monthKey)}</td><td>{fmtMoney(s.balance)}</td><td>{fmtMoney(s.minimum)}</td><td>{fmtMoney(s.interest)}</td><td>{s.dueDate || '—'}</td>
                          <td>{s.fileDataUrl ? <a href={s.fileDataUrl} target="_blank" rel="noreferrer">Ver archivo</a> : <span className="muted">{s.fileName || '—'}</span>}</td>
                          <td><button className="ghost" onClick={() => setEditing({ ...s, detected: true })}>Corregir</button>{' '}<button className="danger" onClick={() => deleteStatement(s.id)}>Eliminar</button></td>
                        </tr>
                      ))}
                    </tbody></table>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'plan' && (
          <section>
            <div className="card">
              <h3>Plan para liquidar</h3>
              <div className="row">
                <button className={plan.mode === 'juntas' ? 'primary' : 'ghost'} onClick={() => setPlan({ mode: 'juntas' })}>Todas juntas</button>
                <button className={plan.mode === 'por_tarjeta' ? 'primary' : 'ghost'} onClick={() => setPlan({ mode: 'por_tarjeta' })}>Por tarjeta</button>
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

        {tab === 'personalizar' && (
          <section>
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
      <footer>App TDC v1 · Tus datos se guardan solo en tu navegador (localStorage). No se suben a ningún servidor. El plan es una simulación educativa, no asesoría financiera.</footer>
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

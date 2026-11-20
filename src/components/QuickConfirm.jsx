import React, { useMemo, useState } from 'react'
import { FIELD_LABELS, MONEY_FIELDS } from '../lib/fields.js'
import { planStatementSave } from '../lib/ledger.js'
import { fmtLong } from '../lib/cycle.js'
import { fmtMoney, fmtMonth } from '../lib/plan.js'

const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : null }
const CRITICAL = [['cutoffDate', 'fecha de corte'], ['dueDate', 'fecha límite'], ['noInterestPayment', 'pago para no generar intereses'], ['minimum', 'pago mínimo'], ['balance', 'saldo'], ['limit', 'límite de crédito'], ['last4', 'últimos 4 dígitos']]
const KINDS = [['cargo', 'Cargo'], ['abono', 'Abono'], ['comision', 'Comisión'], ['interes', 'Interés']]

// Pantalla de confirmación en un clic: resumen limpio + tablas editables solo por si algo salió mal.
export default function QuickConfirm({ draft, data, left, onConfirm, onCancel }) {
  const [f, setF] = useState(() => ({ ...draft, movements: (draft.movements || []).map((m) => ({ ...m })), msi: (draft.msi || []).map((m) => ({ ...m })) }))
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const missing = CRITICAL.filter(([k]) => f[k] === null || f[k] === undefined || f[k] === '')
  const plan = useMemo(() => planStatementSave(data, f), [data, f])

  const setMov = (i, k, v) => set('movements', f.movements.map((m, j) => j === i ? { ...m, [k]: v } : m))
  const delMov = (i) => set('movements', f.movements.filter((_, j) => j !== i))
  const addMov = () => set('movements', [...f.movements, { date: f.cutoffDate || '', description: '', amount: '', kind: 'cargo', currency: 'MXN', original: null }])
  const setMsi = (i, k, v) => set('msi', f.msi.map((m, j) => j === i ? { ...m, [k]: v } : m))
  const delMsi = (i) => set('msi', f.msi.filter((_, j) => j !== i))
  const addMsi = () => set('msi', [...f.msi, { description: '', current: '', total: '', monthly: '', original: null }])

  const tiles = [
    ['Fecha de corte', fmtLong(f.cutoffDate), !!f.cutoffDate],
    ['Fecha límite de pago', fmtLong(f.dueDate), !!f.dueDate],
    ['Pago para no generar intereses', fmtMoney(num(f.noInterestPayment)), num(f.noInterestPayment) !== null],
    ['Pago mínimo', fmtMoney(num(f.minimum)), num(f.minimum) !== null],
    ['Saldo actual', fmtMoney(num(f.balance)), num(f.balance) !== null],
    ['Límite de crédito', fmtMoney(num(f.limit)), num(f.limit) !== null],
  ]
  const hasForeign = f.movements.some((m) => m.original)
  const applyFx = () => {
    const fx = num(f.fxRate)
    if (!fx) return
    set('movements', f.movements.map((m) => m.original && (m.amount === null || m.amount === '' || m.amount === undefined) ? { ...m, amount: Math.round(m.original.amount * fx * 100) / 100 } : m))
  }
  const rawText = (draft.rawLines || []).join('\n')
  const copyRaw = async () => {
    try { await navigator.clipboard.writeText(rawText) } catch {
      const t = document.getElementById('raw-text'); if (t) { t.select(); document.execCommand('copy') }
    }
  }
  const isPdf = (draft.fileType || '').includes('pdf') || /\.pdf$/i.test(draft.fileName || '')
  const cargos = f.movements.filter((m) => m.kind === 'cargo')
  const totalCargos = cargos.reduce((a, m) => a + (num(m.amount) || 0), 0)
  const title = `${f.bank || 'Banco por confirmar'} ${f.product || ''} ${f.last4 ? '····' + String(f.last4).slice(-4) : ''}`.trim()

  const confirm = () => onConfirm({
    ...f,
    movements: f.movements.filter((m) => m.description && String(m.description).trim() && num(m.amount) !== null && m.date),
  })

  return (
    <div className="card quick">
      <h3>Confirma tu estado de cuenta{left > 0 ? ` · ${left} más en cola` : ''}</h3>
      <p className="muted">{title} — {draft.fileName}</p>
      {!draft.detected && <div className="alert">No pude leer el texto automáticamente (foto o PDF protegido). Llena los datos en «Corregir datos»; es el respaldo para PDFs con contraseña.</div>}
      {isPdf && (draft.rawLines || []).length < 5 && <div className="alert">Este PDF casi no trae texto: parece escaneado o una imagen. En ese caso no se puede leer solo; usa «Corregir datos» para capturarlo.</div>}
      {plan.duplicateFile && <div className="alert">⚠️ Este mismo archivo ya lo habías subido. Si confirmas, se reemplaza el estado de ese mes sin duplicar movimientos.</div>}
      {plan.sameMonth && <div className="alert">🔄 Ya tenías el estado de {fmtMonth(plan.monthKey)} de esta tarjeta: se reemplazará con este y no se duplicará nada.</div>}
      {plan.skipped > 0 && <div className="alert">Se omitirán {plan.skipped} movimiento{plan.skipped === 1 ? '' : 's'} que ya estaban registrados en otro estado.</div>}
      {!plan.last4 && <div className="alert">No encontré la terminación de la tarjeta: se creará como tarjeta nueva. Agrégala en «Corregir datos» para ligarla a la que ya tienes.</div>}
      {plan.last4 && !plan.card && <div className="muted">Tarjeta nueva: se creará automáticamente.</div>}

      <div className="tiles">
        {tiles.map(([label, value, ok]) => (
          <div key={label} className={`tile${ok ? '' : ' missing'}`}><span>{label}</span><b>{ok ? value : 'Falta'}</b></div>
        ))}
      </div>
      {missing.length > 0 && <p className="muted">Falta: {missing.map(([, l]) => l).join(', ')}. Puedes confirmar así o completarlo en «Corregir datos».</p>}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" onClick={confirm}>✅ Confirmar y actualizar</button>
        <button className="ghost" onClick={onCancel}>{left > 0 ? 'Saltar este archivo' : 'Cancelar'}</button>
      </div>

      {hasForeign && (
        <div className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label>Tipo de cambio (MXN por 1 USD u otra divisa)</label>
            <input inputMode="decimal" value={f.fxRate ?? ''} onChange={(e) => set('fxRate', e.target.value)} placeholder="Ej. 17.35" />
          </div>
          <button className="ghost" onClick={applyFx}>Calcular equivalente en MXN</button>
        </div>
      )}

      <details style={{ marginTop: 14 }} open={missing.length > 0 && !draft.detected}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Corregir datos detectados</summary>
        <div className="grid" style={{ marginTop: 10 }}>
          {FIELD_LABELS.map(([k, label]) => (
            <div key={k}>
              <label>{label}</label>
              <input type={k === 'cutoffDate' || k === 'dueDate' ? 'date' : 'text'}
                inputMode={MONEY_FIELDS.has(k) || k === 'rate' || k === 'cat' ? 'decimal' : 'text'}
                value={f[k] ?? ''} placeholder={label}
                onChange={(e) => { set(k, e.target.value); if (k === 'cutoffDate' && e.target.value) set('monthKey', e.target.value.slice(0, 7)) }} />
            </div>
          ))}
        </div>
      </details>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Compras a meses sin intereses ({f.msi.length}){plan.msiTotal > 0 ? ` · ${plan.msiNew} nuevas, ${plan.msiUpdated} ya existentes` : ''}</summary>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Compra</th><th>Pago actual</th><th>de</th><th>Mensualidad</th><th></th></tr></thead>
            <tbody>
              {f.msi.map((m, i) => (
                <tr key={i}>
                  <td><input value={m.description} onChange={(e) => setMsi(i, 'description', e.target.value)} /></td>
                  <td><input inputMode="numeric" value={m.current} onChange={(e) => setMsi(i, 'current', e.target.value)} style={{ width: 64 }} /></td>
                  <td><input inputMode="numeric" value={m.total} onChange={(e) => setMsi(i, 'total', e.target.value)} style={{ width: 64 }} /></td>
                  <td><input inputMode="decimal" value={m.monthly} onChange={(e) => setMsi(i, 'monthly', e.target.value)} style={{ width: 110 }} /></td>
                  <td><button className="ghost" onClick={() => delMsi(i)} aria-label="Quitar">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {f.msi.length === 0 && <p className="muted">No detecté compras a MSI. Si tienes, agrégalas con el botón.</p>}
        <button className="ghost" onClick={addMsi}>+ Agregar compra a MSI</button>
      </details>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Movimientos detectados ({f.movements.length}){cargos.length > 0 ? ` · cargos ${fmtMoney(totalCargos)}` : ''}</summary>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Fecha</th><th>Descripción</th><th>Monto (MXN)</th><th>Tipo</th><th></th></tr></thead>
            <tbody>
              {f.movements.slice(0, 200).map((m, i) => (
                <tr key={i}>
                  <td><input type="date" value={m.date || ''} onChange={(e) => setMov(i, 'date', e.target.value)} /></td>
                  <td><input value={m.description} onChange={(e) => setMov(i, 'description', e.target.value)} />{m.original && <span className="muted"> {m.original.amount} {m.original.currency}</span>}</td>
                  <td><input inputMode="decimal" value={m.amount ?? ''} placeholder={m.original ? 'Falta tipo de cambio' : ''} onChange={(e) => setMov(i, 'amount', e.target.value)} style={{ width: 110 }} /></td>
                  <td><select value={m.kind || 'cargo'} onChange={(e) => setMov(i, 'kind', e.target.value)}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                  <td><button className="ghost" onClick={() => delMov(i)} aria-label="Quitar">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {f.movements.length > 200 && <p className="muted">Se muestran los primeros 200 movimientos; los demás también se guardarán.</p>}
        {f.movements.length === 0 && <p className="muted">No detecté movimientos en este archivo; no pasa nada, el resumen y las fechas se actualizan igual.</p>}
        <button className="ghost" onClick={addMov}>+ Agregar movimiento</button>
      </details>

      {(draft.rawLines || []).length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>🔍 Ver lo que leí del PDF ({draft.rawLines.length} renglones{(draft.unparsed || []).length ? `, ${draft.unparsed.length} sin interpretar` : ''})</summary>
          {(draft.unparsed || []).length > 0 && (
            <>
              <p className="muted">Renglones que parecen movimientos o MSI pero no pude interpretar:</p>
              <ul className="muted">{draft.unparsed.slice(0, 15).map((l, i) => <li key={i}>{l}</li>)}</ul>
            </>
          )}
          <p className="muted">Si algo se leyó mal, copia este texto y mándalo para ajustar la lectura de tu banco. Contiene tus datos personales: borra tu nombre, dirección y números de tarjeta antes de compartirlo.</p>
          <textarea id="raw-text" readOnly rows={8} value={rawText} />
          <button className="ghost" onClick={copyRaw}>Copiar texto</button>
        </details>
      )}

      <div className="row" style={{ marginTop: 14 }}>
        <button className="primary" onClick={confirm}>✅ Confirmar y actualizar</button>
      </div>
    </div>
  )
}

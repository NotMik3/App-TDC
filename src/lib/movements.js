// Lee los renglones de un estado de cuenta y separa:
//  - movimientos regulares (cargos, abonos, intereses, comisiones; con soporte para compras en USD u otra divisa)
//  - compras a Meses Sin Intereses (MSI) con parcialidad "04/12" o "4 de 12"
// Nunca inventa datos: lo que no se puede leer con seguridad se omite y se captura a mano en la pantalla de confirmación.

const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12 }
const MONEY = '\\$?\\s?(?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}(?!\\d)(?!\\s?%)'
const MONEY_G = new RegExp(MONEY, 'g')
const MONEY_RE = new RegExp(MONEY)
const TAIL = new RegExp('(-)?\\s?(' + MONEY + ')\\s*(CR|DB|-|\\+)?\\s*$', 'i')

const D_ISO = /^\s*(\d{4})-(\d{2})-(\d{2})/
const MONTHS = 'ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:tiembre|t)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?'
const D_TXT = new RegExp('^\\s*(\\d{1,2})(?:\\s+de)?[\\s\\-\\/.]?(' + MONTHS + ')(?![a-záéíóúñ])\\.?(?:[\\-\\/](\\d{4}|\\d{2})(?!\\d)|\\s(?:de\\s)?(\\d{4})(?!\\d))?', 'i')
const D_NUM = /^\s*(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}|\d{2}))?(?![\d\/])/
const INST = /(^|[^\d\/.\-])((\d{1,2})\s*(?:\bde\b|\/)\s*(\d{1,2}))(?![\d\/.]|\s?%)/i

const MSI_HEAD = /meses sin intereses|\bmsi\b|diferid|planes? de pagos?|promociones?/i
const MSI_WORD = /\bmsi\b|meses sin intereses|sin intereses|parcialidad|mensualidad/i
const END_MSI = /cargos? regulares|movimientos|detalle de (?:operaciones|movimientos)|compras y cargos|comisiones|intereses/i
const IGNORE = /^(saldo|total|subtotal|pago m[ií]nimo|pago para|l[ií]mite|cr[eé]dito|fecha|periodo|per[ií]odo|corte)/i
const ABONO = /^(pago|abono|gracias por su pago|bonificaci|devoluci|reembolso)/i
const INTERES = /^(inter[eé]s|intereses)/i
const COMISION = /comisi[oó]n|anualidad|\biva\b/i

const pad = (n) => String(n).padStart(2, '0')
const round2 = (n) => Math.round(n * 100) / 100
const toNum = (s) => { const v = parseFloat(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(v) ? v : null }
const letters = (s) => (s.match(/[A-Za-zÁÉÍÓÚÑáéíóúñ]/g) || []).length

function ctxFrom(cutoffDate) {
  const m = /^(\d{4})-(\d{2})/.exec(cutoffDate || '')
  if (m) return { year: +m[1], month: +m[2] }
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

// Lee una fecha al inicio del texto. Si no trae año, lo infiere con la fecha de corte
// (una compra de "DIC" en un corte de enero es del año anterior).
function takeDate(str, ctx) {
  let m
  let d, mo, y, len
  if ((m = str.match(D_ISO))) { d = +m[3]; mo = +m[2]; y = m[1]; len = m[0].length }
  else if ((m = str.match(D_TXT))) { d = +m[1]; mo = MESES[m[2].toLowerCase().slice(0, 3)]; y = m[3] || m[4]; len = m[0].length }
  else if ((m = str.match(D_NUM))) { d = +m[1]; mo = +m[2]; y = m[3]; len = m[0].length }
  else return null
  if (!(d >= 1 && d <= 31 && mo >= 1 && mo <= 12)) return null
  const year = y ? (String(y).length === 2 ? 2000 + Number(y) : Number(y)) : (mo > ctx.month ? ctx.year - 1 : ctx.year)
  return { iso: `${year}-${pad(mo)}-${pad(d)}`, rest: str.slice(len) }
}

function matchInst(line) {
  const m = line.match(INST)
  if (!m) return null
  const current = +m[3]
  const total = +m[4]
  if (!(total >= 2 && total <= 60 && current >= 1 && current <= total)) return null
  const start = m.index + m[1].length
  return { current, total, start, end: start + m[2].length }
}

const cleanDesc = (s) => s.replace(/\b(msi|meses sin intereses)\b/gi, '').replace(/\s+/g, ' ').replace(/^[\s\-:*.,]+|[\s\-:*.,$]+$/g, '').trim()

export function parseMovements(lines, parsed = {}) {
  const ctx = ctxFrom(parsed.cutoffDate)
  const movements = []
  const msi = []
  const seenMsi = new Set()
  const unparsed = []
  const miss = (l) => { if (unparsed.length < 80) unparsed.push(l) }
  let inMsi = false
  let fxRate = null

  for (const raw of lines || []) {
    const line = raw.replace(/\s{2,}/g, ' ').trim()
    if (!line) continue

    const fx = line.match(/tipo de cambio[^\d]{0,20}(\d{1,2}\.\d{2,6})/i)
    if (fx && !fxRate) fxRate = parseFloat(fx[1])

    const d1 = takeDate(line, ctx)
    const hasMoney = MONEY_RE.test(line)

    // Encabezados de sección (renglones sin fecha ni montos)
    if (!d1 && !hasMoney) {
      if (MSI_HEAD.test(line)) inMsi = true
      else if (END_MSI.test(line)) inMsi = false
      continue
    }

    // ---- Compras a meses sin intereses ----
    const inst = matchInst(line)
    if (inst && (inMsi || MSI_WORD.test(line)) && hasMoney) {
      let body = d1 ? d1.rest : line
      if (d1) { const d2 = takeDate(d1.rest, ctx); if (d2) body = d2.rest }
      const inst2 = matchInst(body)
      let okMsi = false
      if (inst2) {
        const moneys = (body.match(MONEY_G) || []).map(toNum).filter((n) => n > 0)
        if (moneys.length) {
          const cut = Math.min(...[body.search(MONEY_RE), inst2.start].filter((n) => n >= 0))
          const description = cleanDesc(body.slice(0, cut))
          const key = description.toUpperCase() + '|' + inst2.total
          if (letters(description) >= 3 && !seenMsi.has(key)) {
            seenMsi.add(key)
            let original = null
            let monthly = null
            if (moneys.length === 1) monthly = moneys[0]
            else {
              original = Math.max(...moneys)
              const target = original / inst2.total
              monthly = moneys.filter((n) => n !== original).reduce((best, n) => best === null || Math.abs(n - target) < Math.abs(best - target) ? n : best, null)
              if (monthly === null) monthly = round2(original / inst2.total)
            }
            if (original !== null && monthly > original) { const t = original; original = monthly; monthly = t }
            if (original === null) original = round2(monthly * inst2.total)
            msi.push({ description, current: inst2.current, total: inst2.total, monthly, original })
            okMsi = true
          } else if (seenMsi.has(key)) okMsi = true

        }
      }
      if (!okMsi) miss(line)
      continue
    }
    if (inMsi) { if (d1) miss(line); continue } // dentro de la sección MSI no se mezclan con los movimientos regulares

    // ---- Movimientos regulares: necesitan fecha al inicio y monto al final ----
    if (!d1) continue
    let rest = d1.rest
    const d2 = takeDate(rest, ctx)
    if (d2) rest = d2.rest
    const tail = rest.match(TAIL)
    if (!tail) { miss(line); continue }
    const firstMoney = rest.search(MONEY_RE)
    let description = cleanDesc(rest.slice(0, firstMoney > 0 ? firstMoney : tail.index))
    description = description.replace(/\b(USD|EUR|CAD|GBP|US\$|DLLS?|DLS)\s*$/i, '').trim()
    if (letters(description) < 3) { miss(line); continue }
    if (IGNORE.test(description)) continue

    const negative = !!tail[1] || /^(CR|-)$/i.test(tail[3] || '')
    let kind = 'cargo'
    if (negative || ABONO.test(description)) kind = 'abono'
    else if (INTERES.test(description)) kind = 'interes'
    else if (COMISION.test(description)) kind = 'comision'

    let amount = toNum(tail[2])
    let currency = 'MXN'
    let original = null
    const fc = rest.match(/\b(USD|EUR|CAD|GBP)\b|US\$|\bDLLS?\b|\bDLS\b/i)
    if (fc) {
      currency = fc[1] ? fc[1].toUpperCase() : 'USD'
      const all = (rest.match(MONEY_G) || []).map(toNum)
      original = { amount: all[0], currency }
      amount = all.length >= 2 ? all[all.length - 1] : (fxRate ? round2(all[0] * fxRate) : null)
    }
    movements.push({ date: d1.iso, description, amount, kind, currency, original })
  }
  return { movements, msi, fxRate, unparsed }
}

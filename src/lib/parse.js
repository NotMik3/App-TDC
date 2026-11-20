// Extrae texto de un PDF con pdfjs-dist y detecta los datos de la tarjeta.
// Funciona con los formatos más comunes de estados de cuenta en México
// (Banamex/Citibanamex, BBVA, HSBC, Santander, Banorte, etc.).
// Nunca inventa valores: lo que no encuentra queda vacío para corregirlo a mano.
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function extractPdfText(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  let out = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    out += tc.items.map((it) => it.str).join(' ') + '\n'
  }
  return out
}

const num = (s) => {
  if (!s) return null
  const clean = s.replace(/[$,\s]/g, '').replace(/[^0-9.\-]/g, '')
  const v = parseFloat(clean)
  return Number.isFinite(v) ? v : null
}

function findMoney(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re)
    if (m) {
      const v = num(m[1] || m[0])
      if (v !== null && v > 0) return v
    }
  }
  return null
}

function findDate(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return normalizeDate(m[1] || m[0])
  }
  return null
}

const MESES = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', sept: '09', oct: '10', nov: '11', dic: '12' }
function normalizeDate(s) {
  if (!s) return null
  s = s.trim()
  let m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  m = s.toLowerCase().match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/)
  if (m && MESES[m[2].slice(0, 4)] || (m && MESES[m[2]])) {
    const mm = MESES[m[2]] || MESES[m[2].slice(0, 4)]
    return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`
  }
  m = s.toLowerCase().match(/(\d{1,2})\s+([a-z]{3,})\s+(\d{4})/)
  if (m && MESES[m[2].slice(0, 4)]) {
    return `${m[3]}-${MESES[m[2].slice(0, 4)]}-${m[1].padStart(2, '0')}`
  }
  return null
}

const MONEY = '([\\$]?\\s?[0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{2})?)'
const DATE = '((?:\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{2,4})|(?:\\d{1,2}\\s+de\\s+[A-Za-z]+\\s+(?:de\\s+)?\\d{4})|(?:\\d{1,2}\\s+[A-Za-z]{3,}\\s+\\d{4}))'

export function parseStatementText(text) {
  const t = ' ' + text.replace(/\s+/g, ' ') + ' '
  const out = { bank: null, product: null, last4: null, limit: null, rate: null, cat: null, balance: null, minimum: null, noInterestPayment: null, interest: null, commissions: null, cutoffDate: null, dueDate: null }

  // Banco
  const banks = ['Citibanamex', 'Banamex', 'BBVA', 'HSBC', 'Santander', 'Banorte', 'Scotiabank', 'Inbursa', 'BanBajío', 'Banco Azteca', 'Nu', 'RappiCard', 'American Express', 'Liverpool', 'Palacio de Hierro']
  for (const b of banks) {
    if (new RegExp(b, 'i').test(t)) { out.bank = b === 'Banamex' ? 'Citibanamex' : b; break }
  }
  // Terminación / últimos 4 dígitos
  let m = t.match(/(?:terminaci[oó]n|terminada en|termina en|tarjeta\s+\*+|tarjeta\s+\d{4}\s+\*{2,}|N[uú]mero de tarjeta)[^\d]{0,12}(\d{4})/i)
    || t.match(/\*{4,}\s?(\d{4})/)
    || t.match(/(?:\d{4}[\s\-*]+){3}(\d{4})/)
  if (m) out.last4 = m[1]

  // Producto (línea con la terminación, p. ej. "Clásica ****1234")
  m = t.match(/([A-ZÁÉÍÓÚ][A-Za-zÁÉÍÓÚáéíóú ]{3,40}?)\s*(?:\*+\s?\d{4}|terminaci[oó]n)/i)
  if (m) out.product = m[1].trim()

  out.balance = findMoney(t, [
    new RegExp(`saldo\\s+(?:actual|total|al corte|a pagar)[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`saldo\\s+total[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`total\\s+a\\s+pagar[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.minimum = findMoney(t, [new RegExp(`pago\\s+m[ií]nimo[^$\\d]{0,20}${MONEY}`, 'i')])
  out.noInterestPayment = findMoney(t, [
    new RegExp(`pago\\s+para\\s+no\\s+generar\\s+intereses[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`pago\\s+para\\s+no\\s+generar\\s+inter[eé]s[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.interest = findMoney(t, [
    new RegExp(`intereses?\\s+(?:del\\s+periodo|generados|ordinarios|cobrados)[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`inter[eé]s\\s+ordinario[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.commissions = findMoney(t, [new RegExp(`comisiones?[^$\\d]{0,20}${MONEY}`, 'i')])
  out.limit = findMoney(t, [
    new RegExp(`l[ií]mite\\s+de\\s+cr[eé]dito[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`cr[eé]dito\\s+disponible[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  m = t.match(/tasa\s+(?:de\s+inter[eé]s\s+)?(?:anual|ordinaria)[^\d]{0,20}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i)
    || t.match(/CAT\s+promedio[^\d]{0,40}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i)
  if (m) out.rate = parseFloat(m[1].replace(',', '.'))
  m = t.match(/CAT[^\d]{0,30}(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i)
  if (m) out.cat = parseFloat(m[1].replace(',', '.'))

  out.cutoffDate = findDate(t, [new RegExp(`fecha\\s+de\\s+corte[^\\d]{0,20}${DATE}`, 'i'), new RegExp(`corte[^\\d]{0,20}${DATE}`, 'i')])
  out.dueDate = findDate(t, [
    new RegExp(`fecha\\s+l[ií]mite\\s+de\\s+pago[^\\d]{0,20}${DATE}`, 'i'),
    new RegExp(`pagar\\s+antes\\s+del[^\\d]{0,20}${DATE}`, 'i'),
    new RegExp(`fecha\\s+de\\s+pago[^\\d]{0,20}${DATE}`, 'i'),
  ])
  return out
}

export function monthKeyFromDate(iso) {
  if (!iso) return new Date().toISOString().slice(0, 7)
  return iso.slice(0, 7)
}

// Lectura de estados de cuenta de DÉBITO (TDD): saldo final, lo que entró,
// lo que salió, comisiones y rendimientos. Nunca inventa valores: lo que no
// encuentra queda vacío para corregirlo a mano. Sin desglose por categorías
// automático: los movimientos vienen en texto corrido y no se pueden asignar
// a categorías con seguridad; el mayor gasto del mes se captura a mano.
export function parseDebitStatementText(text) {
  const t = ' ' + text.replace(/\s+/g, ' ') + ' '
  const out = { bank: null, last4: null, closingBalance: null, totalIncome: null, totalExpenses: null, fees: null, interestEarned: null, cutoffDate: null }

  const banks = ['Citibanamex', 'Banamex', 'BBVA', 'HSBC', 'Santander', 'Banorte', 'Scotiabank', 'Inbursa', 'BanBajío', 'Banco Azteca', 'Nu', 'RappiCard', 'American Express', 'Liverpool', 'Palacio de Hierro']
  for (const b of banks) {
    if (new RegExp(b, 'i').test(t)) { out.bank = b === 'Banamex' ? 'Citibanamex' : b; break }
  }
  let m = t.match(/(?:cuenta|terminaci[oó]n|terminada en|termina en|CLABE)[^\d]{0,12}(\d{4})/i)
    || t.match(/\*{4,}\s?(\d{4})/)
  if (m) out.last4 = m[1]

  out.closingBalance = findMoney(t, [
    new RegExp(`saldo\\s+final[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`saldo\\s+al\\s+corte[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`saldo\\s+actual[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.totalIncome = findMoney(t, [
    new RegExp(`total\\s+de\\s+(?:dep[oó]sitos|abonos)[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`(?:dep[oó]sitos|abonos)\\s+(?:del\\s+periodo|totales)[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.totalExpenses = findMoney(t, [
    new RegExp(`total\\s+de\\s+(?:retiros|cargos)[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`(?:retiros|cargos)\\s+(?:del\\s+periodo|totales)[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.fees = findMoney(t, [new RegExp(`comisiones?[^$\\d]{0,20}${MONEY}`, 'i')])
  out.interestEarned = findMoney(t, [
    new RegExp(`intereses?\\s+ganados[^$\\d]{0,20}${MONEY}`, 'i'),
    new RegExp(`rendimientos?[^$\\d]{0,20}${MONEY}`, 'i'),
  ])
  out.cutoffDate = findDate(t, [new RegExp(`fecha\\s+de\\s+corte[^\\d]{0,20}${DATE}`, 'i'), new RegExp(`corte[^\\d]{0,20}${DATE}`, 'i')])
  return out
}

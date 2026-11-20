// Categorías y comercios a partir de la descripción del movimiento (por palabras clave).
// Se calculan al mostrar, así que si mejoras las reglas se aplican también a movimientos ya guardados.
import { norm } from './ledger.js'

const R = (words) => new RegExp('\\b(?:' + words.join('|') + ')', 'i')
const RULES = [
  ['Restaurantes y comida', R(['UBER EATS', 'DIDI FOOD', 'RAPPI', 'RESTAUR', 'CAFE', 'STARBUCKS', 'DOMINO', 'PIZZA', 'TACO', 'MCDONALD', 'BURGER', 'SUSHI', 'KFC', 'VIPS', 'CARLS', 'SUBWAY', 'LITTLE CAESARS'])],
  ['Suscripciones y streaming', R(['NETFLIX', 'SPOTIFY', 'DISNEY', 'HBO', 'PRIME VIDEO', 'AMAZON PRIME', 'YOUTUBE', 'APPLE COM', 'ICLOUD', 'GOOGLE', 'MICROSOFT', 'ADOBE', 'OPENAI', 'CHATGPT', 'CLARO VIDEO', 'VIX', 'PARAMOUNT', 'CANVA', 'DROPBOX', 'TIDAL', 'DEEZER', 'AUDIBLE', 'PLAYSTATION', 'XBOX', 'NINTENDO', 'STEAM', 'DUOLINGO'])],
  ['Transporte y gasolina', R(['UBER', 'DIDI', 'CABIFY', 'GASOL', 'PEMEX', 'SHELL', 'MOBIL', 'G500', 'CASETA', 'CAPUFE', 'ESTACIONAMIENTO'])],
  ['Viajes y hoteles', R(['AEROMEXICO', 'VOLARIS', 'VIVA AEROBUS', 'VIVAAEROBUS', 'AIRBNB', 'BOOKING', 'HOTEL', 'EXPEDIA', 'DESPEGAR', 'AIRLINES', 'HERTZ'])],
  ['Compras en línea y tiendas', R(['AMAZON', 'MERCADO LIBRE', 'MERCADOLIBRE', 'LIVERPOOL', 'COPPEL', 'SHEIN', 'TEMU', 'ALIEXPRESS', 'PALACIO DE HIERRO', 'SEARS', 'LINIO'])],
  ['Salud', R(['FARMACIA', 'BENAVIDES', 'SIMILARES', 'HOSPITAL', 'CLINICA', 'DOCTOR', 'LABORATORIO', 'CHOPO', 'OPTICA', 'DENTAL'])],
  ['Servicios y hogar', R(['CFE', 'TELMEX', 'TELCEL', 'IZZI', 'TOTALPLAY', 'MEGACABLE', 'MOVISTAR', 'HOME DEPOT', 'IKEA', 'SODIMAC', 'LEROY'])],
  ['Entretenimiento', R(['CINEPOLIS', 'CINEMEX', 'TICKETMASTER', 'BOLETOS', 'SUPERBOLETOS', 'SMARTFIT', 'SPORT CITY', 'CASINO'])],
  ['Educación', R(['UNIVERSIDAD', 'COLEGIO', 'ESCUELA', 'COLEGIATURA', 'UDEMY', 'COURSERA', 'LIBRERIA', 'GANDHI'])],
  ['Supermercado y tiendas', R(['WALMART', 'BODEGA AURRERA', 'AURRERA', 'SORIANA', 'CHEDRAUI', 'COSTCO', 'SAMS', 'HEB', 'LA COMER', 'CITY MARKET', 'OXXO', 'SUPERAMA'])],
]
export const categorize = (description, kind) => {
  if (kind === 'interes' || kind === 'comision') return 'Intereses y comisiones'
  const n = norm(description)
  for (const [name, re] of RULES) if (re.test(n)) return name
  return 'Otros'
}

// Nombre corto del comercio (sin folios ni números largos).
export const merchantName = (description) => norm(description).replace(/\b\d{3,}\b/g, '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ') || 'SIN NOMBRE'

export const ymOf = (date) => String(date || '').slice(0, 7)
export const cargos = (data) => (data.movements || []).filter((m) => m.kind === 'cargo' && Number.isFinite(m.amount) && m.amount > 0)
export const monthSpending = (data, ym) => cargos(data).filter((m) => ymOf(m.date) === ym).reduce((a, m) => a + m.amount, 0)
export const monthsWithMovements = (data) => [...new Set((data.movements || []).map((m) => ymOf(m.date)).filter(Boolean))].sort().reverse()

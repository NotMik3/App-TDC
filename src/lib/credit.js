// Salud crediticia: utilización de la línea de crédito.
export const utilPct = (balance, limit) => (limit > 0 ? Math.max(0, ((balance || 0) / limit) * 100) : null)

// Verde < 30 %, amarillo 30-50 %, rojo > 50 % (puede afectar tu Buró de Crédito).
export function utilZone(pct) {
  if (pct < 30) return { key: 'verde', color: '#16a34a', label: 'Saludable' }
  if (pct <= 50) return { key: 'amarillo', color: '#ca8a04', label: 'Atención' }
  return { key: 'rojo', color: '#dc2626', label: 'Alto: puede afectar tu Buró' }
}

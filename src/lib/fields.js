// Campos editables de un estado de cuenta de crédito (compartidos por los formularios).
export const FIELD_LABELS = [
  ['bank', 'Banco'], ['product', 'Producto'], ['last4', 'Últimos 4 dígitos'], ['limit', 'Límite de crédito'],
  ['rate', 'Tasa anual (%)'], ['cat', 'CAT (%)'], ['balance', 'Saldo'], ['minimum', 'Pago mínimo'],
  ['noInterestPayment', 'Pago para no generar intereses'], ['interest', 'Intereses'], ['commissions', 'Comisiones'],
  ['cutoffDate', 'Fecha de corte'], ['dueDate', 'Fecha límite de pago'],
]
export const MONEY_FIELDS = new Set(['limit', 'balance', 'minimum', 'noInterestPayment', 'interest', 'commissions'])

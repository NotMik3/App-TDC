# App TDC v3 — modelo de datos y arquitectura

## Modelo de datos (localStorage, clave única; `schema: 3`)

```
profile        { name, hideAmounts, lastBackup, budgetCap }
subOverrides   { [comercio]: true|false }   (marcas del usuario sobre suscripciones detectadas)
cards[]        { id, bank, product, last4, limit, rate, cat, createdAt }
statements[]   { id, cardId, monthKey, cutoffDate, dueDate, balance, minimum, noInterestPayment,
                 interest, commissions, fileName, fileType, fileDataUrl, fileHash, fxRate, createdAt }
movements[]    { id, statementId, cardId, date, description, amount (MXN), kind, currency,
                 original {amount, currency}|null, category, hash }
msi[]          { id, key, cardId, description, total, current, monthly, original, remaining,
                 firstMonthKey, lastMonthKey, lastStatementId }
payments[]     pagos registrados (ya existía)
debitAccounts[] / debitStatements[]   (ya existía)
plan, appearance                      (ya existía)
```

Reglas de integridad
- Tarjeta = `last4`. Un estado nuevo con una terminación existente se liga a esa tarjeta; si no existe, se crea.
- Un estado por tarjeta y mes: subir otro PDF del mismo mes **reemplaza** el anterior y sus movimientos.
- `movements.hash` = fecha + descripción normalizada + monto + divisa + contador (#n) → un movimiento que ya
  existe en otro estado de la misma tarjeta se omite; dos compras idénticas el mismo día en un solo PDF se conservan.
- `msi.key` = tarjeta + descripción normalizada + total de parcialidades → cada estado nuevo **actualiza** el plan
  (parcialidad actual, saldo por liquidar) en vez de duplicarlo. `remaining = monthly × (total − current)`.
- `statements.fileHash` (SHA-256) avisa si subes exactamente el mismo archivo otra vez.
- Divisas: `amount` siempre es MXN; si la compra fue en USD/otra, `original` guarda el monto y la moneda.
  Si no hay tipo de cambio, `amount` queda vacío para capturarlo.

## Módulos

```
src/lib/                      lógica pura, sin React (se puede probar con Node)
  pdfLines.js                 PDF -> texto + renglones reconstruidos
  parse.js                    campos del estado (banco, fechas, saldos…)        [ya existía]
  movements.js                movimientos y MSI desde los renglones
  ledger.js                   alta de estados sin duplicar (planStatementSave / applyStatement)
  cycle.js                    corte -> gracia -> límite, mejor día para comprar, urgencia
  credit.js                   utilización y zonas verde/amarillo/rojo
  categories.js               categorías, comercios y gasto por mes
  subscriptions.js            detección de cargos recurrentes
  msi.js                      progreso, proyección de pagos y simulación de adelanto
  fileHash.js, fields.js      utilidades
  plan.js, themes.js          plan de pagos y temas                              [ya existían]
src/components/               piezas de pantalla
  Dashboard.jsx  QuickConfirm.jsx  CreditGauge.jsx  CycleTimeline.jsx  DueAlerts.jsx
  MsiPanel.jsx  Simulators.jsx  Analytics.jsx  BarChart.jsx
src/App.jsx                   estado global, pestañas y flujo de carga (sigue siendo el más grande)
```

## Estado de la hoja de ruta
- v3.0 Carga rápida + confirmación, duplicados, Dashboard con termómetro y ciclo.
- v3.1 MSI y suscripciones, proyección 6/12 meses, simuladores (mínimo vs. sin intereses, extra a cuál tarjeta, adelantar MSI),
  gasto por categoría y comercio, tope de presupuesto, tipo de cambio para compras en divisas, panel «Ver lo que leí del PDF».
- Pendiente técnico: mover los PDF adjuntos de localStorage (≈5 MB) a IndexedDB; OCR para fotos.

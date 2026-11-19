# App TDC — Tarjetas de crédito

App web para analizar estados de cuenta de tarjetas de crédito mes a mes y armar un plan para liquidarlas.

## Qué hace

- **Subir estados de cuenta mes a mes**: PDF o foto, varios a la vez, arrastrando o con el botón grande en Resumen y en Estados.
- **Detección automática**: del PDF lee banco, producto, últimos 4 dígitos, límite, tasa anual, CAT, saldo, pago mínimo, pago para no generar intereses, intereses, comisiones y fechas de corte y límite. Si la tarjeta es nueva la crea sola; si ya existe, liga el estado por su terminación sin duplicarla.
- **Corregir**: cada estado tiene un botón "Corregir" para arreglar cualquier número. La captura manual queda como respaldo para PDFs protegidos con contraseña.
- **Resumen**: deuda total, cambio vs el mes anterior, intereses del mes, uso de crédito, alerta del próximo vencimiento y gráficas mes a mes de saldo e intereses.
- **Estados**: historial por tarjeta, con editar/eliminar, y el archivo subido se puede ver dentro de la app.
- **Plan para liquidar**: dos modos, "Todas juntas" (un pago mensual repartido con avalancha o bola de nieve) y "Por tarjeta" (cuánto pagas al mes a cada tarjeta, cuándo se liquida cada una, aviso si el monto está debajo del mínimo, total combinado y ahorro vs pagar solo mínimos).
- **Pagos**: registra lo que realmente pagaste contra la meta del plan.
- **Personalizar**: tema automático, 7 temas listos (Clásico, Océano, Atardecer, Bosque, Uva, Rosa, Noche), colores propios, fondo sólido, degradado, dinámico animado o tu propia foto, esquinas y tamaño de letra. Todo se guarda y se aplica en toda la app.

## Datos

La app empieza vacía, sin saldos inventados. **Tus datos se guardan solo en tu navegador (localStorage)**. No hay backend ni se sube nada a ningún servidor. El plan es una simulación educativa, no asesoría financiera.

## Cómo correrla

```bash
npm install
npm run dev     # desarrollo en http://localhost:5173
npm run build   # genera la carpeta dist/ para producción
```

## Despliegue

Está publicada en Vercel desde este repositorio (proyecto de Vite, `npm run build`, salida `dist/`). Cada push a `main` genera un nuevo despliegue; cada versión queda registrada en el historial de GitHub.

## Versiones

- **v1** — Versión inicial: subida y detección de estados, Resumen, Estados, Plan (Todas juntas / Por tarjeta), Pagos y Personalizar.

# App TDC — Tarjetas de crédito

App web para analizar estados de cuenta de tarjetas de crédito mes a mes y armar un plan para liquidarlas.

## Qué hace

- **Subir estados de cuenta mes a mes**: PDF o foto, varios a la vez, arrastrando o con el botón grande en Resumen y en Estados.
- **Detección automática**: del PDF lee banco, producto, últimos 4 dígitos, límite, tasa anual, CAT, saldo, pago mínimo, pago para no generar intereses, intereses, comisiones y fechas de corte y límite. Si la tarjeta es nueva la crea sola; si ya existe, liga el estado por su terminación sin duplicarla.
- **Corregir**: cada estado tiene un botón "Corregir" para arreglar cualquier número. La captura manual queda como respaldo para PDFs protegidos con contraseña.
- **TDC (Crédito)** (antes Resumen, ahora también con el historial de estados por tarjeta y la captura manual): deuda total, cambio vs el mes anterior, intereses del mes, uso de crédito, alerta del próximo vencimiento y gráficas mes a mes con selector: saldo total, interés acumulado o pagos realizados. En cada tarjeta se muestra su plan para liquidar: pago recomendado según el plan elegido, pago para no generar intereses, interés de este mes, pago mínimo, fecha de corte y fecha límite, restante a pagar, porcentaje de uso y porcentaje de avance para terminar de pagarla.
- **Débito (TDD)**: pestaña separada de las tarjetas de crédito. Sube estados de débito en PDF o foto y detecta el banco, la cuenta por sus últimos 4 dígitos, el saldo final, cuánto entró, cuánto salió y las comisiones. Muestra dinero total en débito, lo que quedó en el mes, porcentaje gastado, gráficas a elegir (saldo final, entró vs salió o % que quedó) e historial mes a mes por cuenta. El mayor gasto del mes y el desglose por categorías se capturan a mano en el formulario de corrección (no se generan solos del texto del estado).
- **Barra lateral minimalista**: saludo con tu nombre (se cambia en Personalizar) y las secciones como opciones con círculo de selección: Dashboard, TDC (Crédito), TDD (Débito), Plan para liquidar, Pagos y Personalizar. En celular se vuelve una barra horizontal arriba.
- **Dashboard**: vista general con deuda total, dinero en débito, posición neta, intereses del mes, próximos pagos y todas tus tarjetas de crédito y cuentas de débito en un solo lugar.
- **Plan para liquidar**: dos modos, "Todas juntas" (un pago mensual repartido con avalancha o bola de nieve) y "Por tarjeta" (cuánto pagas al mes a cada tarjeta, cuándo se liquida cada una, aviso si el monto está debajo del mínimo, total combinado y ahorro vs pagar solo mínimos).
- **Pagos**: registra lo que realmente pagaste contra la meta del plan.
- **Carga rápida (v3)**: arrastra uno o varios PDF en el Dashboard o en TDC (Crédito) → pantalla de confirmación con el resumen (corte, límite, pago sin intereses, mínimo, saldo, límite de crédito) → «Confirmar y actualizar». Lee también movimientos y compras a MSI (parcialidad `04/12`), evita duplicados (mismo mes = reemplaza; mismo movimiento = se omite; mismo archivo = aviso) y permite corregir todo en tablas editables.
- **Dashboard (v3)**: termómetro de utilización (verde < 30 %, amarillo 30-50 %, rojo > 50 %) total y por tarjeta, línea de tiempo del ciclo (corte → gracia → límite) con cuenta regresiva, «Mejor día para comprar» y alertas a 5 días, 2 días y el mismo día.
- **Calendario**: vista mensual con tus fechas de corte, fechas límite y pagos registrados (las fechas se repiten cada mes según tu último estado).
- **Avisos de vencimiento**: banner rojo en Dashboard y TDC (Crédito) y globo con número en la barra lateral cuando una tarjeta vence en 5 días o menos.
- **Simulador "¿y si pago más?"**: en Plan para liquidar, compara tu plan actual contra pagar un extra al mes (meses que te ahorras e intereses que dejas de pagar).
- **Modo privado**: botón en la barra lateral que oculta todos los montos ($•••••) y se acuerda al recargar.
- **Instalable (PWA)**: se puede instalar como app en el celular o la computadora y abre sin conexión después de la primera visita. Solo funciona en la versión compilada (`npm run build` + `npm run preview`, o en Vercel), no en `npm run dev`.
- **Respaldo**: en Personalizar descargas un archivo .json con todos tus datos y lo restauras cuando quieras (útil si borras el navegador o cambias de equipo). El Dashboard te avisa si no has respaldado en más de 30 días.
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
- **v2** — Pestañas en formato de opciones (con Débito), plan para liquidar sobre cada tarjeta en Resumen (pago recomendado, pago para no generar intereses, interés, mínimo, corte y límite, restante, % de uso y % de avance), gráficas con selector (saldo total, interés acumulado o pagos realizados) y pestaña Débito (TDD) con detección de cuenta, saldo final, entró/salió, % gastado y gráficas propias. Código listo en local, pendiente de subir a GitHub (el repo sigue en v1) y de desbloquear el despliegue en Vercel.
- **v2.1** — Desglose de gastos por categoría en Débito (captura manual en el formulario de corrección).
- **v2.2** — Barra lateral con bienvenida por nombre, nueva pestaña Dashboard, Resumen renombrado a TDC (Crédito) y pestaña Estados eliminada (su historial con Corregir/Eliminar/Ver archivo ahora vive dentro de cada tarjeta en TDC (Crédito)).
- **v2.3** — Respaldo: descargar y restaurar todos tus datos en un archivo .json, con aviso en el Dashboard.
- **v2.4** — Calendario, avisos de vencimiento, simulador de pago extra, modo privado e instalación como app (PWA).
- **v2.4.1** — Ajustes para celular: barra de pestañas abajo, tablas y gráficas con scroll horizontal, campos y colores que respetan el modo oscuro, fondo con foto sin bloqueo en móvil.
- **v3.0** — Carga rápida con confirmación en un clic, lectura de movimientos y MSI, detección de duplicados, Dashboard con termómetro y línea de tiempo del ciclo. Modelo de datos y arquitectura en `docs/ARQUITECTURA.md`.

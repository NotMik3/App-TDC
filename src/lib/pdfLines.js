// Lee un PDF con pdfjs-dist y devuelve:
//  - text: todo el texto en el orden original del PDF (lo usa el detector de campos del estado)
//  - lines: el texto reconstruido por renglones (agrupa por posición vertical), que sirve para
//    leer la tabla de movimientos y la de meses sin intereses.
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function extractPdf(file) {
  const buf = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  let text = ''
  const lines = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    text += tc.items.map((it) => it.str).join(' ') + '\n'
    const items = tc.items
      .filter((it) => typeof it.str === 'string' && it.str.trim() !== '')
      .map((it) => ({ s: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width || 0 }))
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    let cur = []
    let curY = null
    const flush = () => {
      if (!cur.length) return
      cur.sort((a, b) => a.x - b.x)
      let line = ''
      let prevEnd = null
      for (const it of cur) {
        if (prevEnd !== null) line += it.x - prevEnd > 12 ? '   ' : ' '
        line += it.s
        prevEnd = it.x + it.w
      }
      lines.push(line.trim())
      cur = []
    }
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > 3) { flush(); curY = it.y }
      cur.push(it)
    }
    flush()
  }
  return { text, lines }
}

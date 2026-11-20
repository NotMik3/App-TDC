// Huella SHA-256 del archivo para detectar que subiste el mismo PDF dos veces.
// Si el navegador no ofrece crypto.subtle (p. ej. página sin https), usa nombre + tamaño + fecha.
export async function hashFile(file) {
  try {
    const buf = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return `${file.name}|${file.size}|${file.lastModified}`
  }
}

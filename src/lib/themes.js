export const THEMES = {
  clasico: { label: 'Clásico', accent: '#2563eb', bg: '#f1f5f9', card: '#ffffff', text: '#0f172a' },
  oceano: { label: 'Océano', accent: '#0ea5e9', bg: '#e0f2fe', card: '#ffffff', text: '#0c2d48' },
  atardecer: { label: 'Atardecer', accent: '#ea580c', bg: '#ffedd5', card: '#fff7ed', text: '#431407' },
  bosque: { label: 'Bosque', accent: '#16a34a', bg: '#dcfce7', card: '#f0fdf4', text: '#14532d' },
  uva: { label: 'Uva', accent: '#7c3aed', bg: '#ede9fe', card: '#faf5ff', text: '#3b0764' },
  rosa: { label: 'Rosa', accent: '#db2777', bg: '#fce7f3', card: '#fff1f2', text: '#500724' },
  noche: { label: 'Noche', accent: '#38bdf8', bg: '#0f172a', card: '#1e293b', text: '#f1f5f9' },
}
export const DEFAULT_APPEARANCE = {
  theme: 'clasico', mode: 'auto', accent: '', bg: '', card: '', text: '',
  bgMode: 'solido', bgPhoto: null, radius: 'suave', fontSize: 'mediana',
}
export function resolveAppearance(a) {
  const preset = THEMES[a.theme] || THEMES.clasico
  const dark = a.mode === 'noche' || (a.mode === 'auto' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  const base = a.theme === 'noche' || dark ? THEMES.noche : preset
  return {
    accent: a.accent || base.accent,
    bg: a.bg || base.bg,
    card: a.card || base.card,
    text: a.text || base.text,
    bgMode: a.bgMode || 'solido',
    bgPhoto: a.bgPhoto || null,
    radius: a.radius || 'suave',
    fontSize: a.fontSize || 'mediana',
  }
}
export const RADIUS = { suave: '12px', redondo: '24px', recto: '4px' }
export const FONT_SIZE = { chica: '14px', mediana: '16px', grande: '18px' }

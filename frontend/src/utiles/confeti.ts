import confetti from 'canvas-confetti'

// colores AGP: cielo, acero, carbón y blanco (como pedacitos de vidrio)
const COLORES = ['#7ECEE0', '#3E97B5', '#9CC7D3', '#4A4A4D', '#FFFFFF', '#256F89']

// Lluvia de vidrios de colores cuando se termina un pedido
export function celebrar(origen?: { x: number; y: number }) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const base = { colors: COLORES, zIndex: 9999, disableForReducedMotion: true }
  confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 42, origin: origen ?? { x: 0.5, y: 0.55 } })
  window.setTimeout(() => confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 180)
  window.setTimeout(() => confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 320)
}

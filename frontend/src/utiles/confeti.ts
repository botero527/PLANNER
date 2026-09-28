import confetti from 'canvas-confetti'

const COLORES = ['#7C8CFF', '#B06BFF', '#FF7AA8', '#FFC36B', '#2FCB8B', '#3FD1FF']

// Lluvia de vidrios de colores cuando se termina un pedido
export function celebrar(origen?: { x: number; y: number }) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const base = { colors: COLORES, zIndex: 9999, disableForReducedMotion: true }
  confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 42, origin: origen ?? { x: 0.5, y: 0.55 } })
  window.setTimeout(() => confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 180)
  window.setTimeout(() => confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 320)
}

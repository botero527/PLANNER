import type { Yo } from '@/api/tipos'

// Cada rol arranca en su pantalla: el comercial en sus pedidos, los que
// trabajan los pedidos directo al tablero.
export function rutaInicio(usuario: Yo): string {
  const trabajaTarjetas = usuario.permisos.includes('tarjeta.mover')
  if (!trabajaTarjetas && usuario.permisos.includes('pedido.crear')) return '/mis-pedidos'
  return '/tablero'
}

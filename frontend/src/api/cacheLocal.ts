// Cambios directos a la cache de React Query, sin volver a pedirle nada al servidor.
//
// Antes cada evento en vivo hacia "invalidate" y la app volvia a pedir el
// tablero entero (9+ consultas a Azure, ~1.3 s) por cada mensaje de chat.
// Ahora, si el evento ya trae el dato, lo metemos directo en pantalla.
import type { QueryClient, QueryKey } from '@tanstack/react-query'
import type { Mensaje, Miembro, PedidoDetalle, Tablero, UsuarioMini } from './tipos'

/** Mensaje que todavia no confirma el servidor (se pinta medio transparente). */
export type MensajeLocal = Mensaje & { pendiente?: boolean }

export function insertarMensaje(qc: QueryClient, m: Mensaje) {
  let esNuevo = false
  qc.setQueryData<MensajeLocal[]>(['mensajes', m.pedido_id], (lista) => {
    if (!lista) return lista
    if (lista.some((x) => x.id === m.id)) return lista  // ya estaba (llego por HTTP y por WebSocket)
    esNuevo = true
    // si es mio y lo tenia "pendiente", el real reemplaza al temporal
    const i = lista.findIndex((x) => x.pendiente && x.autor.id === m.autor.id && x.texto === m.texto)
    if (i >= 0) {
      esNuevo = false  // el contador ya se habia sumado con el temporal
      const copia = [...lista]
      copia[i] = m
      return copia
    }
    return [...lista, m]
  })
  if (esNuevo) sumarMensajes(qc, m.pedido_id, 1)
}

export function reemplazarMensaje(qc: QueryClient, m: Mensaje) {
  qc.setQueryData<MensajeLocal[]>(['mensajes', m.pedido_id], (lista) => lista?.map((x) => (x.id === m.id ? m : x)))
}

export function sumarMensajes(qc: QueryClient, pedidoId: number, cuanto: number) {
  qc.setQueryData<Tablero>(['tablero'], (t) => t && {
    ...t,
    pedidos: t.pedidos.map((p) => (p.id === pedidoId ? { ...p, total_mensajes: p.total_mensajes + cuanto } : p)),
  })
  qc.setQueryData<PedidoDetalle>(['pedido', pedidoId], (p) => p && { ...p, total_mensajes: p.total_mensajes + cuanto })
}

export function moverEnTablero(qc: QueryClient, pedidoId: number, columnaId: number, posicion: number) {
  qc.setQueryData<Tablero>(['tablero'], (t) => {
    if (!t) return t
    const pedidos = t.pedidos.map((p) => (p.id === pedidoId ? { ...p, columna_id: columnaId, posicion } : p))
    // el tablero se pinta en el orden de la lista: la reordenamos igual que el backend
    pedidos.sort((a, b) => a.columna_id - b.columna_id || a.posicion - b.posicion || a.id - b.id)
    return { ...t, pedidos }
  })
}

/**
 * Pide de nuevo una consulta, pero si llegan varios eventos seguidos hace UNA
 * sola peticion al final (eso es un "debounce"). Si 5 personas mueven tarjetas
 * en el mismo segundo, el tablero se recarga una vez y no cinco.
 */
const pendientes = new Map<string, number>()
export function refrescarPronto(qc: QueryClient, clave: QueryKey, ms = 400) {
  const id = JSON.stringify(clave)
  window.clearTimeout(pendientes.get(id))
  pendientes.set(id, window.setTimeout(() => {
    pendientes.delete(id)
    // si tengo cambios mios todavia viajando (asignar, chat, checklist...), espero:
    // recargar ahora traeria un estado viejo y la pantalla "parpadearia" hacia atras
    if (qc.isMutating() > 0) return refrescarPronto(qc, clave, ms)
    qc.invalidateQueries({ queryKey: clave })
  }, ms))
}

/** Cambia los asignados de un pedido en pantalla (detalle y tarjeta del tablero) sin esperar al servidor. */
export function ponerAsignados(qc: QueryClient, pedidoId: number, asignados: UsuarioMini[]) {
  const ids = new Set(asignados.map((u) => u.id))
  const nuevos = (miembros: Miembro[]): Miembro[] => [
    // los seguidores se quedan (menos los que ahora quedaron asignados)
    ...miembros.filter((m) => m.tipo === 'seguidor' && !ids.has(m.usuario.id)),
    ...asignados.map((u) => ({ usuario: u, tipo: 'asignado' as const })),
  ]
  qc.setQueryData<PedidoDetalle>(['pedido', pedidoId], (p) => p && { ...p, miembros: nuevos(p.miembros) })
  qc.setQueryData<Tablero>(['tablero'], (t) => t && {
    ...t,
    pedidos: t.pedidos.map((p) => (p.id === pedidoId ? { ...p, miembros: nuevos(p.miembros) } : p)),
  })
}

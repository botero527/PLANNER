// Todas las llamadas al backend con nombre propio. Los componentes nunca
// escriben una URL: llaman api.pedidos.mover(...) y listo.
import { api } from './cliente'
import type {
  Adjunto, Bandeja, Catalogos, Columna, MisAlertas, EdicionPedido, EntradaHistorial, ItemConfig, Mensaje,
  NuevoPedido, PedidoDetalle, Rol, Tablero, Usuario, UsuarioMini, Yo,
} from './tipos'

interface Login {
  token: string
  usuario: Yo
}

export const auth = {
  login: (usuario: string, password: string) =>
    api<Login>('/auth/login', { method: 'POST', json: { usuario, password } }),
  yo: () => api<Yo>('/auth/yo'),
  cambiarPassword: (actual: string, nueva: string) =>
    api<Login>('/auth/cambiar-password', { method: 'POST', json: { actual, nueva } }),
  alertas: () => api<MisAlertas>('/auth/alertas'),
  guardarAlertas: (recibir_correos: boolean, activas: string[]) =>
    api<MisAlertas>('/auth/alertas', { method: 'PUT', json: { recibir_correos, activas } }),
  probarAlertas: () => api<{ ok: boolean; para: string; modo_envio: string }>('/auth/alertas/prueba', { method: 'POST' }),
}

export const tablero = {
  ver: () => api<Tablero>('/tablero'),
  catalogos: () => api<Catalogos>('/tablero/catalogos'),
  crearColumna: (datos: Partial<Columna>) => api<Columna>('/tablero/columnas', { method: 'POST', json: datos }),
  editarColumna: (id: number, datos: Partial<Columna>) =>
    api<Columna>(`/tablero/columnas/${id}`, { method: 'PATCH', json: datos }),
  ordenarColumnas: (ids: number[]) => api<Columna[]>('/tablero/columnas/orden', { method: 'PUT', json: { ids } }),
  archivarColumna: (id: number) => api<void>(`/tablero/columnas/${id}`, { method: 'DELETE' }),
  config: () => api<ItemConfig[]>('/tablero/configuracion'),
  guardarConfig: (clave: string, valor: string) =>
    api<ItemConfig>(`/tablero/configuracion/${encodeURIComponent(clave)}`, { method: 'PUT', json: { valor } }),
}

export const pedidos = {
  crear: (datos: NuevoPedido) => api<PedidoDetalle>('/pedidos', { method: 'POST', json: datos }),
  ver: (id: number) => api<PedidoDetalle>(`/pedidos/${id}`),
  editar: (id: number, datos: EdicionPedido) => api<PedidoDetalle>(`/pedidos/${id}`, { method: 'PATCH', json: datos }),
  mover: (id: number, columna_id: number, indice: number) =>
    api<PedidoDetalle>(`/pedidos/${id}/mover`, { method: 'POST', json: { columna_id, indice } }),
  asignar: (id: number, asignados: number[]) =>
    api<PedidoDetalle>(`/pedidos/${id}/miembros`, { method: 'PUT', json: { asignados } }),
  seguir: (id: number) => api<{ siguiendo: boolean }>(`/pedidos/${id}/seguir`, { method: 'POST' }),
  eliminar: (id: number) => api<void>(`/pedidos/${id}`, { method: 'DELETE' }),
  historial: (id: number) => api<EntradaHistorial[]>(`/pedidos/${id}/historial`),
  agregarItem: (id: number, texto: string) =>
    api<PedidoDetalle>(`/pedidos/${id}/checklist`, { method: 'POST', json: { texto } }),
  editarItem: (itemId: number, datos: { texto?: string; hecho?: boolean }) =>
    api<PedidoDetalle>(`/pedidos/checklist/${itemId}`, { method: 'PATCH', json: datos }),
  borrarItem: (itemId: number) => api<PedidoDetalle>(`/pedidos/checklist/${itemId}`, { method: 'DELETE' }),
}

export const ingreso = {
  marcarCodigo: (pedidoId: number, evidencia: File[], codigo?: string) => {
    const form = new FormData()
    evidencia.forEach((a) => form.append('evidencia', a))
    if (codigo?.trim()) form.append('codigo', codigo.trim())
    return api<PedidoDetalle>(`/pedidos/${pedidoId}/ingreso/codigo-vehiculo`, { method: 'POST', body: form })
  },
  deshacerCodigo: (pedidoId: number) => api<PedidoDetalle>(`/pedidos/${pedidoId}/ingreso/codigo-vehiculo`, { method: 'DELETE' }),
  ponerNumero: (pedidoId: number, numero: string) =>
    api<PedidoDetalle>(`/pedidos/${pedidoId}/ingreso/numero-pedido`, { method: 'PUT', json: { numero } }),
  aprobar: (pedidoId: number) => api<PedidoDetalle>(`/pedidos/${pedidoId}/ingreso/aprobar`, { method: 'POST' }),
}

export const chat = {
  mensajes: (pedidoId: number, antesDe?: number) =>
    api<Mensaje[]>(`/pedidos/${pedidoId}/mensajes${antesDe ? `?antes_de=${antesDe}` : ''}`),
  enviar: (pedidoId: number, texto: string, respuesta_a_id?: number | null) =>
    api<Mensaje>(`/pedidos/${pedidoId}/mensajes`, { method: 'POST', json: { texto, respuesta_a_id } }),
  editar: (id: number, texto: string) => api<Mensaje>(`/mensajes/${id}`, { method: 'PATCH', json: { texto } }),
  eliminar: (id: number) => api<Mensaje>(`/mensajes/${id}`, { method: 'DELETE' }),
}

export const adjuntos = {
  listar: (pedidoId: number) => api<Adjunto[]>(`/pedidos/${pedidoId}/adjuntos`),
  subir: (pedidoId: number, archivos: File[], mensajeId?: number) => {
    const form = new FormData()
    archivos.forEach((a) => form.append('archivos', a))
    if (mensajeId) form.append('mensaje_id', String(mensajeId))
    return api<Adjunto[]>(`/pedidos/${pedidoId}/adjuntos`, { method: 'POST', body: form })
  },
  eliminar: (id: number) => api<void>(`/adjuntos/${id}`, { method: 'DELETE' }),
}

export const usuarios = {
  equipo: () => api<UsuarioMini[]>('/usuarios/equipo'),
  listar: () => api<Usuario[]>('/usuarios'),
  roles: () => api<Rol[]>('/usuarios/roles'),
  crear: (datos: Record<string, unknown>) => api<Usuario>('/usuarios', { method: 'POST', json: datos }),
  editar: (id: number, datos: Record<string, unknown>) =>
    api<Usuario>(`/usuarios/${id}`, { method: 'PATCH', json: datos }),
  resetPassword: (id: number, password_temporal: string) =>
    api<Usuario>(`/usuarios/${id}/reset-password`, { method: 'POST', json: { password_temporal } }),
}

export const notificaciones = {
  bandeja: () => api<Bandeja>('/notificaciones'),
  leer: (datos: { ids?: number[]; pedido_id?: number }) =>
    api<{ marcadas: number }>('/notificaciones/leer', { method: 'POST', json: datos }),
}

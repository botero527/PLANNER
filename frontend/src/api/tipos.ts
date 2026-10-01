// Espejo de los schemas del backend (app/modulos/*/schemas.py).
// Si alla cambia un campo, aca se cambia igual; TypeScript avisa donde se rompe.

export type Personaje = 'vidrito' | 'vendedora' | 'trazos' | 'tuerca' | 'jefa'
export type Prioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type TipoVidrio = 'original' | '3d'

export interface Rol {
  id: number
  codigo: string
  nombre: string
  color: string
}

export interface UsuarioMini {
  id: number
  nombre: string
  usuario: string
  personaje: Personaje
}

export interface Usuario extends UsuarioMini {
  correo: string | null
  rol: Rol
  activo: boolean
  recibir_correos: boolean
  debe_cambiar_password: boolean
  ultimo_acceso: string | null
}

export interface Yo extends Usuario {
  permisos: string[]
}

export interface Columna {
  id: number
  nombre: string
  descripcion: string | null
  orden: number
  color: string
  icono: string
  es_inicial: boolean
  es_final: boolean
  limite_wip: number | null
}

export interface Etiqueta {
  id: number
  nombre: string
  color: string
}

export interface Miembro {
  usuario: UsuarioMini
  tipo: 'asignado' | 'seguidor'
}

export interface Pieza {
  id?: number
  codigo?: string | null
  nombre: string
  observacion?: string | null
}

export interface PiezaCatalogo {
  codigo: string
  nombre: string
  simetrica: string | null
}

export interface Catalogos {
  piezas: PiezaCatalogo[]
  mercados: string[]
}

export interface ItemChecklist {
  id: number
  texto: string
  hecho: boolean
  orden: number
}

export interface Tarjeta {
  id: number
  codigo: string
  marca: string
  modelo: string
  version_vehiculo: string | null
  anio: number | null
  mercado: string
  tipo_vidrio: TipoVidrio
  prioridad: Prioridad
  fecha_requerida: string | null
  columna_id: number
  posicion: number
  creado_por: UsuarioMini
  miembros: Miembro[]
  etiquetas: Etiqueta[]
  total_piezas: number
  checklist_hechos: number
  checklist_total: number
  total_mensajes: number
  total_adjuntos: number
  portada_url: string | null
  completado_en: string | null
  creado_en: string
  version: number
}

export interface PedidoDetalle extends Tarjeta {
  vin: string
  plataforma: string | null
  info_en_drive: boolean | null
  descripcion: string | null
  piezas: Pieza[]
  checklist: ItemChecklist[]
  datos_extra: Record<string, unknown> | null
  actualizado_en: string
  puedo_editar: boolean
}

export interface Tablero {
  columnas: Columna[]
  pedidos: Tarjeta[]
  etiquetas: Etiqueta[]
}

export interface Adjunto {
  id: number
  pedido_id: number
  mensaje_id: number | null
  nombre: string
  tipo_mime: string
  tamano_bytes: number
  es_imagen: boolean
  url: string
  url_descarga: string
  subido_por: UsuarioMini
  creado_en: string
}

export interface Mensaje {
  id: number
  pedido_id: number
  autor: UsuarioMini
  texto: string
  respuesta_a_id: number | null
  editado_en: string | null
  eliminado: boolean
  creado_en: string
  adjuntos: Adjunto[]
}

export interface EntradaHistorial {
  id: number
  accion: string
  detalle: Record<string, unknown> | null
  usuario: UsuarioMini
  creado_en: string
}

export interface Notificacion {
  id: number
  pedido_id: number | null
  tipo: string
  titulo: string
  cuerpo: string | null
  leida_en: string | null
  creado_en: string
}

export interface Bandeja {
  sin_leer: number
  items: Notificacion[]
}

export interface ItemConfig {
  clave: string
  valor: string
  descripcion: string | null
}

export interface NuevoPedido {
  marca: string
  modelo: string
  version_vehiculo?: string | null
  plataforma?: string | null
  anio?: number | null
  vin: string
  mercado: string
  tipo_vidrio: TipoVidrio
  info_en_drive?: boolean | null
  descripcion?: string | null
  piezas: Pieza[]
  asignados?: number[]
  etiquetas?: number[]
}

export type EdicionPedido = Partial<Omit<NuevoPedido, 'asignados'>> & {
  version: number
  prioridad?: Prioridad
  fecha_requerida?: string | null
}

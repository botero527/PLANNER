// Fechas y numeros para mostrar. El backend manda todo en UTC (con la Z);
// aca se pasa a hora Colombia.

const ZONA = 'America/Bogota'

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return ''
  // una fecha sin hora (2026-10-05) se toma como dia local, no como medianoche UTC
  const fecha = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: ZONA })
}

export function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: ZONA,
  })
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: ZONA })
}

const relativo = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

export function haceCuanto(iso: string): string {
  const segundos = (new Date(iso).getTime() - Date.now()) / 1000
  const pasos: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
  ]
  for (const [unidad, s] of pasos) {
    if (Math.abs(segundos) >= s) return relativo.format(Math.round(segundos / s), unidad)
  }
  return 'justo ahora'
}

/** dias que faltan para la fecha requerida (negativo = vencido) */
export function diasPara(fecha: string | null): number | null {
  if (!fecha) return null
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const objetivo = new Date(`${fecha}T00:00:00`)
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86400000)
}

export function tamanoArchivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

export function primerNombre(nombre: string): string {
  return nombre.split(' ')[0]
}

export const NOMBRE_PRIORIDAD = { baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente' } as const

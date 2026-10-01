import { useQuery } from '@tanstack/react-query'
import { pedidos } from '@/api/endpoints'
import type { EntradaHistorial } from '@/api/tipos'
import { Avatar } from '@/componentes/Avatar'
import { fechaHora, haceCuanto } from '@/utiles/formato'

const DESCRIPCION: Record<string, (d: Record<string, unknown> | null) => string> = {
  'pedido.creado': () => 'creó el pedido',
  'pedido.movido': (d) => `lo movió de «${d?.de}» a «${d?.a}»`,
  'pedido.completado': (d) => `lo terminó (pasó a «${d?.a}») 🎉`,
  'pedido.editado': (d) => {
    const campos = Object.keys((d?.despues as object) ?? {})
    return campos.length ? `editó ${campos.join(', ')}` : 'editó el pedido'
  },
  'pedido.asignado': (d) => `asignó a ${(d?.asignados as string[] | undefined)?.join(', ')}`,
  'adjunto.subido': (d) => `subió ${(d?.archivos as string[] | undefined)?.join(', ')}`,
  'pedido.eliminado': () => 'eliminó el pedido',
  'ingreso.codigo_creado': (d) => `creó el código de vehículo${d?.codigo ? ` ${d.codigo}` : ''} y subió la evidencia`,
  'ingreso.codigo_deshecho': () => 'deshizo la marca del código de vehículo',
  'ingreso.pedido_ingresado': (d) => (d?.antes ? `corrigió el número de pedido a ${d?.numero}` : `puso el número de pedido ${d?.numero}`),
  'ingreso.aprobado': (d) => `aprobó el ingreso y lo pasó a «${d?.a}» ✅`,
}

const COLOR: Record<string, string> = {
  'pedido.creado': 'var(--info)', 'pedido.movido': 'var(--agp-acero)', 'pedido.completado': 'var(--exito)',
  'pedido.asignado': 'var(--alerta)', 'adjunto.subido': 'var(--agp-cielo)', 'pedido.eliminado': 'var(--peligro)',
  'ingreso.codigo_creado': 'var(--agp-acero)', 'ingreso.pedido_ingresado': 'var(--agp-cielo)', 'ingreso.aprobado': 'var(--exito)',
}

export function PestanaHistorial({ pedidoId }: { pedidoId: number }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['historial', pedidoId], queryFn: () => pedidos.historial(pedidoId) })
  if (isLoading) return <p className="sutil">Cargando…</p>

  return (
    <ol className="historial">
      {data.map((h: EntradaHistorial) => (
        <li key={h.id} style={{ '--c': COLOR[h.accion] ?? 'var(--texto-3)' } as React.CSSProperties}>
          <span className="historial__punto" />
          <Avatar usuario={h.usuario} tamano={30} />
          <div>
            <p><b>{h.usuario.nombre}</b> {(DESCRIPCION[h.accion] ?? (() => h.accion))(h.detalle)}</p>
            <time title={fechaHora(h.creado_en)}>{haceCuanto(h.creado_en)}</time>
          </div>
        </li>
      ))}
    </ol>
  )
}

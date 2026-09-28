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
}

const COLOR: Record<string, string> = {
  'pedido.creado': 'var(--info)', 'pedido.movido': '#b06bff', 'pedido.completado': 'var(--exito)',
  'pedido.asignado': 'var(--alerta)', 'adjunto.subido': '#3fd1ff', 'pedido.eliminado': 'var(--peligro)',
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

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarDays, CheckSquare, MessageCircle, Paperclip, Puzzle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { memo, useRef } from 'react'
import { pedidos } from '@/api/endpoints'
import type { Tarjeta } from '@/api/tipos'
import { PilaAvatares } from '@/componentes/Avatar'
import { diasPara, fechaCorta, NOMBRE_PRIORIDAD } from '@/utiles/formato'

interface Props {
  tarjeta: Tarjeta
  alAbrir: (id: number) => void
  puedeMover: boolean
}

// memo: si la tarjeta no cambio, React no la vuelve a pintar cuando se
// mueve otra. Con 100 tarjetas en pantalla eso se nota.
export const TarjetaArrastrable = memo(function TarjetaArrastrable({ tarjeta, alAbrir, puedeMover }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tarjeta.id,
    data: { tipo: 'tarjeta', columnaId: tarjeta.columna_id },
    disabled: !puedeMover,
  })

  // Prefetch: si el mouse se queda un momento encima, pedimos el detalle antes
  // del clic. Cuando la persona da clic, ya llego y el panel abre completo.
  const qc = useQueryClient()
  const espera = useRef<number>(0)
  const anticipar = () => {
    espera.current = window.setTimeout(() => {
      qc.prefetchQuery({ queryKey: ['pedido', tarjeta.id], queryFn: () => pedidos.ver(tarjeta.id), staleTime: 15000 })
    }, 120)
  }

  return (
    <div
      ref={setNodeRef}
      onPointerEnter={anticipar}
      onPointerLeave={() => window.clearTimeout(espera.current)}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`tarjeta-hueco ${isDragging ? 'arrastrando' : ''}`}
      {...attributes}
      {...listeners}
    >
      <TarjetaPedido tarjeta={tarjeta} alAbrir={alAbrir} />
    </div>
  )
})

export function TarjetaPedido({ tarjeta: t, alAbrir, flotando }: { tarjeta: Tarjeta; alAbrir?: (id: number) => void; flotando?: boolean }) {
  const dias = t.completado_en ? null : diasPara(t.fecha_requerida)
  const estadoFecha = dias === null ? '' : dias < 0 ? 'vencida' : dias <= 2 ? 'pronto' : ''
  const asignados = t.miembros.filter((m) => m.tipo === 'asignado').map((m) => m.usuario)

  return (
    <article
      className={`tarjeta vidrio ${flotando ? 'tarjeta--flotando' : ''} ${t.completado_en ? 'tarjeta--lista' : ''}`}
      style={{ '--prioridad': `var(--prioridad-${t.prioridad})` } as React.CSSProperties}
      onClick={() => alAbrir?.(t.id)}
      onKeyDown={(e) => e.key === 'Enter' && alAbrir?.(t.id)}
      tabIndex={0}
      aria-label={`${t.codigo} ${t.marca} ${t.modelo}`}
    >
      {t.portada_url && (
        <div className="tarjeta__portada">
          <img src={t.portada_url} alt="" loading="lazy" draggable={false} />
        </div>
      )}

      {t.etiquetas.length > 0 && (
        <div className="tarjeta__etiquetas">
          {t.etiquetas.map((e) => (
            <span key={e.id} className="tarjeta__etiqueta" style={{ background: e.color }} title={e.nombre}>
              {e.nombre}
            </span>
          ))}
        </div>
      )}

      <div className="tarjeta__cabeza">
        <span className="tarjeta__codigo mono">{t.codigo}</span>
        {(t.prioridad === 'alta' || t.prioridad === 'urgente') && (
          <span className={`tarjeta__prioridad ${t.prioridad}`}>{NOMBRE_PRIORIDAD[t.prioridad]}</span>
        )}
      </div>

      <h3 className="tarjeta__titulo">
        {t.marca} <span>{t.modelo}</span>
      </h3>
      <p className="tarjeta__anio">
        {[t.version_vehiculo, t.anio].filter(Boolean).join(' · ')}
      </p>
      {!t.aprobado_en && <ProgresoIngreso tarjeta={t} />}
      <div className="tarjeta__chips">
        <span className="tarjeta__chip">{t.mercado}</span>
        {t.tipo_vidrio === '3d' && <span className="tarjeta__chip tarjeta__chip--3d">3D</span>}
      </div>

      {t.checklist_total > 0 && (
        <div className="tarjeta__progreso" title={`${t.checklist_hechos} de ${t.checklist_total} listos`}>
          <span style={{ width: `${(t.checklist_hechos / t.checklist_total) * 100}%` }} />
        </div>
      )}

      <footer className="tarjeta__pie">
        <div className="tarjeta__datos">
          <span title="Piezas"><Puzzle size={14} />{t.total_piezas}</span>
          {t.checklist_total > 0 && (
            <span className={t.checklist_hechos === t.checklist_total ? 'completo' : ''} title="Checklist">
              <CheckSquare size={14} />{t.checklist_hechos}/{t.checklist_total}
            </span>
          )}
          {t.total_mensajes > 0 && <span title="Mensajes"><MessageCircle size={14} />{t.total_mensajes}</span>}
          {t.total_adjuntos > 0 && <span title="Archivos"><Paperclip size={14} />{t.total_adjuntos}</span>}
          {t.fecha_requerida && (
            <span className={`tarjeta__fecha ${estadoFecha}`} title="Fecha requerida">
              <CalendarDays size={14} />{fechaCorta(t.fecha_requerida)}
            </span>
          )}
        </div>
        {asignados.length > 0 && <PilaAvatares usuarios={asignados} max={3} tamano={24} />}
      </footer>
    </article>
  )
}

/** 3 rayitas: codigo de vehiculo -> numero de pedido -> aprobado (solo en la primera columna) */
function ProgresoIngreso({ tarjeta: t }: { tarjeta: Tarjeta }) {
  const pasos = [
    { ok: Boolean(t.codigo_vehiculo_en), texto: 'Código de vehículo' },
    { ok: Boolean(t.numero_pedido), texto: 'Número de pedido' },
    { ok: false, texto: 'Aprobación' },
  ]
  const falta = pasos.find((p) => !p.ok)
  return (
    <div className="tarjeta__ingreso" title={`Ingreso: falta ${falta?.texto.toLowerCase()}`}>
      <div className="tarjeta__ingreso-barras">{pasos.map((p, i) => <span key={i} className={p.ok ? 'ok' : ''} />)}</div>
      <small>Falta: {falta?.texto}</small>
    </div>
  )
}

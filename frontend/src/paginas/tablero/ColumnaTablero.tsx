import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Check, Inbox, Pencil, RefreshCw, Wrench, type LucideIcon } from 'lucide-react'
import type { Columna, Tarjeta } from '@/api/tipos'
import { Personaje } from '@/componentes/personajes/Personaje'
import { TarjetaArrastrable } from './TarjetaPedido'

const ICONOS: Record<string, LucideIcon> = { inbox: Inbox, pencil: Pencil, wrench: Wrench, refresh: RefreshCw, check: Check }

interface Props {
  columna: Columna
  tarjetas: Tarjeta[]
  alAbrir: (id: number) => void
  puedeMover: boolean
  resaltada: boolean
}

export function ColumnaTablero({ columna, tarjetas, alAbrir, puedeMover, resaltada }: Props) {
  // la columna tambien es "zona de soltar", asi se puede tirar una tarjeta en una columna vacia
  const { setNodeRef } = useDroppable({ id: `col-${columna.id}`, data: { tipo: 'columna', columnaId: columna.id } })
  const Icono = ICONOS[columna.icono] ?? Inbox
  const activas = tarjetas.filter((t) => !t.completado_en).length
  const llena = columna.limite_wip !== null && activas >= columna.limite_wip

  return (
    <section
      className={`columna vidrio ${resaltada ? 'resaltada' : ''} ${llena ? 'llena' : ''}`}
      style={{ '--color-columna': columna.color } as React.CSSProperties}
      aria-label={columna.nombre}
    >
      <header className="columna__cabeza">
        <span className="columna__icono"><Icono size={16} /></span>
        <div className="columna__nombre">
          <h2>{columna.nombre}</h2>
          {columna.descripcion && <p>{columna.descripcion}</p>}
        </div>
        <span className="columna__conteo" title={columna.limite_wip ? `Máximo ${columna.limite_wip}` : undefined}>
          {tarjetas.length}
          {columna.limite_wip !== null && <small>/{columna.limite_wip}</small>}
        </span>
      </header>

      <div ref={setNodeRef} className="columna__lista">
        <SortableContext items={tarjetas.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tarjetas.map((t) => (
            <TarjetaArrastrable key={t.id} tarjeta={t} alAbrir={alAbrir} puedeMover={puedeMover} />
          ))}
        </SortableContext>

        {tarjetas.length === 0 && (
          <div className="columna__vacia">
            <Personaje expresion={resaltada ? 'sorprendido' : 'dormido'} tamano={62} quieto={!resaltada} />
            <p>{resaltada ? '¡Suéltalo aquí!' : columna.es_final ? 'Aún no hay terminados' : 'Nada por aquí'}</p>
          </div>
        )}
      </div>
    </section>
  )
}

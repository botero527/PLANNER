// El panel del pedido (como abrir una tarjeta en Planner): datos, chat, archivos e historial.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Bell, BellOff, History, Info, MessagesSquare, Paperclip, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { chat, notificaciones, pedidos } from '@/api/endpoints'
import type { Columna, Etiqueta, PedidoDetalle, Tablero, Tarjeta } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Avatar } from '@/componentes/Avatar'
import { Panel } from '@/componentes/Panel'
import { Personaje } from '@/componentes/personajes/Personaje'
import { celebrar } from '@/utiles/confeti'
import { fechaHora, NOMBRE_PRIORIDAD } from '@/utiles/formato'
import { PestanaArchivos } from './PestanaArchivos'
import { PestanaChat } from './PestanaChat'
import { PestanaDetalles } from './PestanaDetalles'
import { PestanaHistorial } from './PestanaHistorial'
import './detalle.css'

type Pestana = 'detalles' | 'chat' | 'archivos' | 'historial'

interface Props {
  pedidoId: number | null
  alCerrar: () => void
  columnas: Columna[]
  etiquetas: Etiqueta[]
}

export function DetallePedido({ pedidoId, alCerrar, columnas, etiquetas }: Props) {
  return (
    <Panel abierto={pedidoId !== null} alCerrar={alCerrar} etiqueta="Detalle del pedido" ancho={780}>
      {pedidoId !== null && <Contenido key={pedidoId} pedidoId={pedidoId} alCerrar={alCerrar} columnas={columnas} etiquetas={etiquetas} />}
    </Panel>
  )
}

function Contenido({ pedidoId, alCerrar, columnas, etiquetas }: Props & { pedidoId: number }) {
  const { usuario, puede } = useAuth()
  const qc = useQueryClient()
  const [pestana, setPestana] = useState<Pestana>('detalles')
  // Mientras llega el detalle, el panel abre YA con lo que la tarjeta del tablero
  // ya sabe (codigo, marca, columna...). Eso es "placeholderData".
  const { data: pedido, error, isPlaceholderData } = useQuery({
    queryKey: ['pedido', pedidoId],
    queryFn: () => pedidos.ver(pedidoId),
    placeholderData: () => desdeTarjeta(qc.getQueryData<Tablero>(['tablero'])?.pedidos.find((p) => p.id === pedidoId)),
  })

  // los mensajes se piden de una vez, asi la pestaña Chat ya esta lista al tocarla
  useEffect(() => {
    qc.prefetchQuery({ queryKey: ['mensajes', pedidoId], queryFn: () => chat.mensajes(pedidoId), staleTime: 10000 })
  }, [pedidoId, qc])

  // al abrir el pedido, sus notificaciones quedan leidas
  useEffect(() => {
    notificaciones.leer({ pedido_id: pedidoId }).then(() => qc.invalidateQueries({ queryKey: ['notificaciones'] }))
  }, [pedidoId, qc])

  // Optimista: el paso cambia al instante y si el servidor dice que no, se devuelve.
  const mover = useMutation({
    mutationFn: (columnaId: number) => pedidos.mover(pedidoId, columnaId, 0),
    onMutate: async (columnaId) => {
      await qc.cancelQueries({ queryKey: ['pedido', pedidoId] })
      const antes = qc.getQueryData<PedidoDetalle>(['pedido', pedidoId])
      if (antes) qc.setQueryData(['pedido', pedidoId], { ...antes, columna_id: columnaId })
      if (columnas.find((c) => c.id === columnaId)?.es_final) celebrar()
      return { antes }
    },
    // solo su pedazo (columna): pisar el pedido entero borraria cambios de checklist o responsables en camino
    onSuccess: (p) => qc.setQueryData<PedidoDetalle>(['pedido', pedidoId], (actual) => actual && { ...actual, columna_id: p.columna_id, posicion: p.posicion, completado_en: p.completado_en }),
    onError: (e, _columna, ctx) => {
      if (ctx?.antes) qc.setQueryData(['pedido', pedidoId], ctx.antes)
      toast.error(e instanceof ErrorApi ? e.message : 'No se pudo mover')
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tablero'] }),
  })

  const seguir = useMutation({
    mutationFn: () => pedidos.seguir(pedidoId),
    onSuccess: (r) => {
      toast(r.siguiendo ? 'Ahora sigues este pedido 🔔' : 'Ya no lo sigues')
      qc.invalidateQueries({ queryKey: ['pedido', pedidoId] })
    },
  })

  const eliminar = useMutation({
    mutationFn: () => pedidos.eliminar(pedidoId),
    onSuccess: () => {
      toast.success('Pedido eliminado')
      qc.invalidateQueries({ queryKey: ['tablero'] })
      alCerrar()
    },
  })

  if (error) {
    return (
      <div className="detalle__vacio">
        <Personaje expresion="triste" />
        <p>{(error as Error).message}</p>
        <button className="btn" onClick={alCerrar}>Cerrar</button>
      </div>
    )
  }
  if (!pedido || !usuario) return <div className="detalle__vacio"><Personaje expresion="pensando" /><p>Cargando pedido…</p></div>

  const columna = columnas.find((c) => c.id === pedido.columna_id)
  const miMembresia = pedido.miembros.find((m) => m.usuario.id === usuario.id)
  // el creador y los asignados siempre siguen el pedido; los demas lo pueden seguir si quieren
  const puedeAlternarSeguir = pedido.creado_por.id !== usuario.id && miMembresia?.tipo !== 'asignado'

  const pestanas: { id: Pestana; texto: string; icono: typeof Info; cuenta?: number }[] = [
    { id: 'detalles', texto: 'Detalles', icono: Info },
    { id: 'chat', texto: 'Chat', icono: MessagesSquare, cuenta: pedido.total_mensajes },
    { id: 'archivos', texto: 'Archivos', icono: Paperclip, cuenta: pedido.total_adjuntos },
    { id: 'historial', texto: 'Historial', icono: History },
  ]

  return (
    <div className="detalle" style={{ '--prioridad': `var(--prioridad-${pedido.prioridad})`, '--color-columna': columna?.color } as React.CSSProperties}>
      <header className="detalle__cabeza">
        <div className="detalle__fila-sup">
          <span className="chip mono">{pedido.codigo}</span>
          <span className="chip">{pedido.mercado}</span>
          {pedido.tipo_vidrio === '3d' && <span className="chip detalle__3d">3D</span>}
          {pedido.prioridad !== 'media' && (
            <span className="chip detalle__prioridad">
              <span className="punto" style={{ background: 'var(--prioridad)' }} />
              {NOMBRE_PRIORIDAD[pedido.prioridad]}
            </span>
          )}
          <div className="detalle__acciones">
            {puedeAlternarSeguir && (
              <button className="btn btn-fantasma btn-chico" onClick={() => seguir.mutate()} disabled={seguir.isPending}>
                {miMembresia ? <><BellOff size={15} /> Dejar de seguir</> : <><Bell size={15} /> Seguir</>}
              </button>
            )}
            {puede('pedido.eliminar') && (
              <button
                className="btn btn-fantasma btn-icono btn-peligro"
                title="Eliminar pedido"
                onClick={() => window.confirm(`¿Eliminar ${pedido.codigo}? Se puede recuperar desde la base de datos.`) && eliminar.mutate()}
              >
                <Trash2 size={17} />
              </button>
            )}
            <button className="btn btn-fantasma btn-icono" onClick={alCerrar} aria-label="Cerrar"><X size={19} /></button>
          </div>
        </div>

        <h2 className="detalle__titulo">
          {pedido.marca} <span>{pedido.modelo}</span> {pedido.version_vehiculo && <small>{pedido.version_vehiculo}</small>} {pedido.anio && <small>{pedido.anio}</small>}
        </h2>
        <div className="detalle__meta">
          <Avatar usuario={pedido.creado_por} tamano={22} />
          <span>Creado por <b>{pedido.creado_por.nombre}</b> · {fechaHora(pedido.creado_en)}</span>
        </div>

        {/* camino de columnas: se ve en que paso va y (si puede) se mueve con un clic */}
        <ol className="detalle__camino">
          {columnas.map((c, i) => {
            const actual = c.id === pedido.columna_id
            const pasada = columnas.findIndex((x) => x.id === pedido.columna_id) > i
            return (
              <li key={c.id}>
                <button
                  className={`detalle__paso ${actual ? 'actual' : ''} ${pasada ? 'pasada' : ''}`}
                  style={{ '--c': c.color } as React.CSSProperties}
                  disabled={!puede('tarjeta.mover') || actual}
                  onClick={() => mover.mutate(c.id)}
                  title={puede('tarjeta.mover') ? `Mover a ${c.nombre}` : c.nombre}
                >
                  {actual && <motion.span layoutId="paso-actual" className="detalle__paso-fondo" />}
                  <span className="detalle__paso-texto">{c.nombre}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <nav className="detalle__pestanas" role="tablist">
          {pestanas.map(({ id, texto, icono: Icono, cuenta }) => (
            <button key={id} role="tab" aria-selected={pestana === id} className={pestana === id ? 'activa' : ''} onClick={() => setPestana(id)}>
              <Icono size={16} /> {texto}
              {!!cuenta && <span className="detalle__cuenta">{cuenta}</span>}
              {pestana === id && <motion.span layoutId="pestana-activa" className="detalle__subrayado" />}
            </button>
          ))}
        </nav>
      </header>

      <div className="detalle__cuerpo">
        {pestana === 'detalles' && (isPlaceholderData ? <CargandoDetalles /> : <PestanaDetalles pedido={pedido} etiquetas={etiquetas} />)}
        {pestana === 'chat' && <PestanaChat pedido={pedido} />}
        {pestana === 'archivos' && <PestanaArchivos pedido={pedido} />}
        {pestana === 'historial' && <PestanaHistorial pedidoId={pedido.id} />}
      </div>
    </div>
  )
}

/** Arma un "detalle" provisional con los datos de la tarjeta (lo que falta va vacio). */
function desdeTarjeta(t?: Tarjeta): PedidoDetalle | undefined {
  if (!t) return undefined
  return {
    ...t, vin: '', plataforma: null, info_en_drive: null, descripcion: null,
    piezas: [], checklist: [], datos_extra: null, actualizado_en: t.creado_en, puedo_editar: false,
  }
}

function CargandoDetalles() {
  return (
    <div className="detalles">
      {[150, 120, 90].map((alto, i) => <div key={i} className="esqueleto__tarjeta" style={{ height: alto }} />)}
    </div>
  )
}

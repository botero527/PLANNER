// El tablero tipo Planner: columnas, tarjetas que se arrastran, filtros y el detalle.
import {
  closestCorners, DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent, type UniqueIdentifier,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Flame, PackagePlus, PartyPopper, Search, UserRound, X } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { pedidos, tablero } from '@/api/endpoints'
import type { Prioridad, Tarjeta } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Personaje } from '@/componentes/personajes/Personaje'
import { TituloBarra } from '@/componentes/TituloBarra'
import { celebrar } from '@/utiles/confeti'
import { diasPara, NOMBRE_PRIORIDAD } from '@/utiles/formato'
import { DetallePedido } from '../pedido/DetallePedido'
import { ColumnaTablero } from './ColumnaTablero'
import { TarjetaPedido } from './TarjetaPedido'
import './tablero.css'

type Orden = Record<number, number[]>

const PRIORIDADES: Prioridad[] = ['urgente', 'alta', 'media', 'baja']

export default function Tablero() {
  const { usuario, puede } = useAuth()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const pedidoAbierto = Number(params.get('pedido')) || null

  const { data, isLoading, error } = useQuery({ queryKey: ['tablero'], queryFn: tablero.ver })

  const [busqueda, setBusqueda] = useState('')
  const [soloMios, setSoloMios] = useState(false)
  const [prioridades, setPrioridades] = useState<Set<Prioridad>>(new Set())
  const [etiqueta, setEtiqueta] = useState<number | null>(null)

  // orden local: solo existe mientras se arrastra o mientras el servidor confirma
  const [ordenLocal, setOrdenLocal] = useState<Orden | null>(null)
  const [arrastrada, setArrastrada] = useState<Tarjeta | null>(null)
  const [columnaEncima, setColumnaEncima] = useState<number | null>(null)
  const inicioArrastre = useRef<{ columna: number; indice: number } | null>(null)
  const ordenRef = useRef<Orden>({})

  const porId = useMemo(() => new Map(data?.pedidos.map((p) => [p.id, p])), [data])

  const ordenServidor = useMemo<Orden>(() => {
    const orden: Orden = {}
    data?.columnas.forEach((c) => (orden[c.id] = []))
    // el backend ya los manda ordenados por columna y posicion
    data?.pedidos.forEach((p) => orden[p.columna_id]?.push(p.id))
    return orden
  }, [data])

  const orden = ordenLocal ?? ordenServidor
  // los manejadores del arrastre leen el orden desde el ref para tener siempre el ultimo
  useLayoutEffect(() => {
    ordenRef.current = orden
  })

  const pasaFiltros = useCallback((t: Tarjeta) => {
    if (prioridades.size && !prioridades.has(t.prioridad)) return false
    if (etiqueta && !t.etiquetas.some((e) => e.id === etiqueta)) return false
    if (soloMios && usuario && t.creado_por.id !== usuario.id && !t.miembros.some((m) => m.usuario.id === usuario.id)) return false
    if (busqueda.trim()) {
      const q = busqueda.trim().toLowerCase()
      const texto = `${t.codigo} ${t.marca} ${t.modelo} ${t.version_vehiculo ?? ''} ${t.anio ?? ''} ${t.mercado} ${t.creado_por.nombre}`.toLowerCase()
      if (!texto.includes(q)) return false
    }
    return true
  }, [busqueda, soloMios, prioridades, etiqueta, usuario])

  const hayFiltros = Boolean(busqueda.trim() || soloMios || prioridades.size || etiqueta)

  const resumen = useMemo(() => {
    const activos = data?.pedidos.filter((p) => !p.completado_en) ?? []
    const haceSemana = Date.now() - 7 * 86400000
    return {
      activos: activos.length,
      urgentes: activos.filter((p) => p.prioridad === 'urgente').length,
      vencidos: activos.filter((p) => (diasPara(p.fecha_requerida) ?? 1) < 0).length,
      terminados: data?.pedidos.filter((p) => p.completado_en && new Date(p.completado_en).getTime() > haceSemana).length ?? 0,
    }
  }, [data])

  const mover = useMutation({
    mutationFn: (v: { id: number; columna: number; indice: number }) => pedidos.mover(v.id, v.columna, v.indice),
    onSuccess: (pedido, v) => {
      const destino = data?.columnas.find((c) => c.id === v.columna)
      if (destino?.es_final && inicioArrastre.current?.columna !== v.columna) {
        celebrar()
        toast.success(`¡${pedido.codigo} terminado! 🎉`)
      }
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo mover la tarjeta'),
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['tablero'] })
      setOrdenLocal(null)
    },
  })

  const sensores = useSensors(
    // 6px de tolerancia: asi un clic normal abre la tarjeta y no la arrastra
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const columnaDe = (id: UniqueIdentifier): number | null => {
    if (typeof id === 'string' && id.startsWith('col-')) return Number(id.slice(4))
    for (const [col, ids] of Object.entries(ordenRef.current)) {
      if (ids.includes(Number(id))) return Number(col)
    }
    return null
  }

  const alEmpezar = ({ active }: DragStartEvent) => {
    const col = columnaDe(active.id)
    if (col === null) return
    inicioArrastre.current = { columna: col, indice: ordenRef.current[col].indexOf(Number(active.id)) }
    setOrdenLocal(structuredClone(ordenRef.current))
    setArrastrada(porId.get(Number(active.id)) ?? null)
  }

  // mientras pasa por encima de otra columna, la tarjeta se "muda" en vivo
  const alPasar = ({ active, over }: DragOverEvent) => {
    if (!over) return setColumnaEncima(null)
    const desde = columnaDe(active.id)
    const hacia = columnaDe(over.id)
    setColumnaEncima(hacia)
    if (desde === null || hacia === null || desde === hacia) return

    setOrdenLocal((prev) => {
      const actual = prev ?? ordenRef.current
      const id = Number(active.id)
      const destino = actual[hacia].filter((x) => x !== id)
      const indiceEncima = destino.indexOf(Number(over.id))
      let indice = destino.length
      if (indiceEncima >= 0) {
        const debajo = active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2
        indice = indiceEncima + (debajo ? 1 : 0)
      }
      destino.splice(indice, 0, id)
      return { ...actual, [desde]: actual[desde].filter((x) => x !== id), [hacia]: destino }
    })
  }

  const alSoltar = ({ active, over }: DragEndEvent) => {
    setArrastrada(null)
    setColumnaEncima(null)
    const inicio = inicioArrastre.current
    const id = Number(active.id)
    const col = columnaDe(active.id)
    if (!over || col === null || !inicio) return setOrdenLocal(null)

    let lista = ordenRef.current[col]
    const deDonde = lista.indexOf(id)
    const aDonde = lista.indexOf(Number(over.id))
    if (aDonde >= 0 && deDonde !== aDonde) {
      lista = arrayMove(lista, deDonde, aDonde)
      setOrdenLocal({ ...ordenRef.current, [col]: lista })
    }
    const indice = lista.indexOf(id)
    if (col === inicio.columna && indice === inicio.indice) return setOrdenLocal(null)
    mover.mutate({ id, columna: col, indice })
  }

  const abrir = useCallback((id: number) => setParams((p) => {
    p.set('pedido', String(id))
    return p
  }), [setParams])
  const cerrar = useCallback(() => setParams((p) => {
    p.delete('pedido')
    return p
  }), [setParams])

  if (isLoading) return <CargandoTablero />
  if (error || !data) return <div className="tablero__error"><Personaje expresion="triste" /><p>No se pudo cargar el tablero. {(error as Error)?.message}</p></div>

  const puedeMover = puede('tarjeta.mover')

  return (
    <div className="tablero">
      <TituloBarra>
        <div className="tablero__barra">
          <h1 className="titulo-pagina">Tablero</h1>
          <label className="tablero__buscar">
            <Search size={16} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar marca, modelo, código…" />
            {busqueda && <button onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda"><X size={14} /></button>}
          </label>
          {puede('pedido.crear') && (
            <Link to="/nuevo" className="btn btn-primario"><PackagePlus size={17} /> Nuevo pedido</Link>
          )}
        </div>
      </TituloBarra>

      <div className="tablero__resumen">
        <Resumen icono={<Flame size={16} />} valor={resumen.activos} texto="en proceso" />
        <Resumen icono={<AlertTriangle size={16} />} valor={resumen.urgentes} texto="urgentes" tono="peligro" />
        <Resumen icono={<CalendarClock size={16} />} valor={resumen.vencidos} texto="vencidos" tono="alerta" />
        <Resumen icono={<PartyPopper size={16} />} valor={resumen.terminados} texto="listos esta semana" tono="exito" />

        <div className="tablero__filtros">
          <button className={`chip filtro ${soloMios ? 'activo' : ''}`} onClick={() => setSoloMios((v) => !v)}>
            <UserRound size={13} /> Míos
          </button>
          {PRIORIDADES.map((p) => (
            <button
              key={p}
              className={`chip filtro ${prioridades.has(p) ? 'activo' : ''}`}
              onClick={() => setPrioridades((s) => {
                const n = new Set(s)
                if (n.has(p)) n.delete(p)
                else n.add(p)
                return n
              })}
            >
              <span className="punto" style={{ background: `var(--prioridad-${p})` }} />
              {NOMBRE_PRIORIDAD[p]}
            </button>
          ))}
          {data.etiquetas.map((e) => (
            <button key={e.id} className={`chip filtro ${etiqueta === e.id ? 'activo' : ''}`} onClick={() => setEtiqueta((x) => (x === e.id ? null : e.id))}>
              <span className="punto" style={{ background: e.color }} />{e.nombre}
            </button>
          ))}
          {hayFiltros && (
            <button className="chip filtro limpiar" onClick={() => { setBusqueda(''); setSoloMios(false); setPrioridades(new Set()); setEtiqueta(null) }}>
              <X size={13} /> Quitar filtros
            </button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensores}
        collisionDetection={closestCorners}
        onDragStart={alEmpezar}
        onDragOver={alPasar}
        onDragEnd={alSoltar}
        onDragCancel={() => { setArrastrada(null); setColumnaEncima(null); setOrdenLocal(null) }}
      >
        <div className="tablero__columnas">
          {data.columnas.map((c) => (
            <ColumnaTablero
              key={c.id}
              columna={c}
              tarjetas={(orden[c.id] ?? []).map((id) => porId.get(id)).filter((t): t is Tarjeta => Boolean(t) && pasaFiltros(t!))}
              alAbrir={abrir}
              puedeMover={puedeMover}
              resaltada={arrastrada !== null && columnaEncima === c.id}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {arrastrada && <TarjetaPedido tarjeta={arrastrada} flotando />}
        </DragOverlay>
      </DndContext>

      <DetallePedido pedidoId={pedidoAbierto} alCerrar={cerrar} columnas={data.columnas} etiquetas={data.etiquetas} />
    </div>
  )
}

function Resumen({ icono, valor, texto, tono }: { icono: React.ReactNode; valor: number; texto: string; tono?: string }) {
  return (
    <div className={`resumen vidrio ${tono ?? ''}`}>
      <span className="resumen__icono">{icono}</span>
      <strong>{valor}</strong>
      <span>{texto}</span>
    </div>
  )
}

function CargandoTablero() {
  return (
    <div className="tablero">
      <div className="tablero__columnas">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="columna vidrio esqueleto">
            <div className="esqueleto__linea" style={{ width: '50%' }} />
            {[0, 1, 2].slice(0, 3 - (i % 2)).map((j) => <div key={j} className="esqueleto__tarjeta" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

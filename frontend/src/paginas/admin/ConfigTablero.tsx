// Configurar el tablero sin tocar codigo: columnas (estados), limites y que eventos mandan correo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Archive, Flag, Plus, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { tablero } from '@/api/endpoints'
import type { Columna } from '@/api/tipos'
import { TituloBarra } from '@/componentes/TituloBarra'
import './admin.css'

const EVENTOS = [
  { id: 'pedido.creado', texto: 'Pedido nuevo' },
  { id: 'pedido.movido', texto: 'Cambio de columna' },
  { id: 'pedido.completado', texto: 'Pedido terminado' },
  { id: 'pedido.asignado', texto: 'Me asignan un pedido' },
  { id: 'chat.mencion', texto: 'Me mencionan en el chat' },
  { id: 'chat.mensaje', texto: 'Cualquier mensaje del chat' },
  { id: 'pedido.editado', texto: 'Editan el pedido' },
  { id: 'adjunto.subido', texto: 'Suben archivos' },
]

const ICONOS = ['inbox', 'pencil', 'wrench', 'refresh', 'check']
const error = (e: unknown) => toast.error(e instanceof ErrorApi ? e.message : 'Algo salió mal')

export default function ConfigTablero() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['tablero'], queryFn: tablero.ver })
  const { data: config = [] } = useQuery({ queryKey: ['config'], queryFn: tablero.config })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['tablero'] })

  const ordenar = useMutation({ mutationFn: tablero.ordenarColumnas, onSuccess: refrescar, onError: error })
  const crear = useMutation({
    mutationFn: () => tablero.crearColumna({ nombre: 'Nueva columna', color: '#38BDF8', icono: 'inbox' }),
    onSuccess: refrescar,
    onError: error,
  })

  const columnas = data?.columnas ?? []
  const eventos = config.find((c) => c.clave === 'correo.eventos')?.valor ?? ''
  const dias = config.find((c) => c.clave === 'tablero.dias_visibles_terminados')?.valor ?? '30'
  const mover = (i: number, delta: number) => {
    const ids = columnas.map((c) => c.id)
    const j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    ordenar.mutate(ids)
  }

  return (
    <div className="admin">
      <TituloBarra><h1 className="titulo-pagina">Configurar tablero</h1></TituloBarra>

      <section className="admin__seccion vidrio">
        <div className="detalles__titulo-bloque">
          <div>
            <h2>Columnas del proceso</h2>
            <p className="sutil">Es un borrador: cámbialas cuando se defina el flujo real. Los pedidos no se pierden.</p>
          </div>
          <button className="btn" onClick={() => crear.mutate()} disabled={crear.isPending}><Plus size={16} /> Columna</button>
        </div>
        <ul className="config__columnas">
          {columnas.map((c, i) => (
            // la key cambia si la columna cambia en el servidor: React la monta de cero con los datos nuevos
            <FilaColumna key={`${c.id}-${c.nombre}-${c.descripcion}-${c.color}-${c.icono}-${c.limite_wip}-${c.es_final}`} columna={c} primera={i === 0} ultima={i === columnas.length - 1} alSubir={() => mover(i, -1)} alBajar={() => mover(i, 1)} alGuardar={refrescar} />
          ))}
        </ul>
      </section>

      <CorreosConfig key={eventos} valor={eventos} />
      <DiasVisibles key={dias} valor={dias} />
    </div>
  )
}

function FilaColumna({ columna, primera, ultima, alSubir, alBajar, alGuardar }: { columna: Columna; primera: boolean; ultima: boolean; alSubir: () => void; alBajar: () => void; alGuardar: () => void }) {
  const [f, setF] = useState({ nombre: columna.nombre, descripcion: columna.descripcion ?? '', color: columna.color, icono: columna.icono, limite: columna.limite_wip ? String(columna.limite_wip) : '', es_final: columna.es_final })

  const cambio = f.nombre !== columna.nombre || f.descripcion !== (columna.descripcion ?? '') || f.color.toLowerCase() !== columna.color.toLowerCase() ||
    f.icono !== columna.icono || f.limite !== (columna.limite_wip ? String(columna.limite_wip) : '') || f.es_final !== columna.es_final

  const guardar = useMutation({
    mutationFn: () => tablero.editarColumna(columna.id, {
      nombre: f.nombre, descripcion: f.descripcion || null, color: f.color, icono: f.icono,
      limite_wip: f.limite ? Number(f.limite) : null, es_final: f.es_final,
    }),
    onSuccess: () => { toast.success('Columna guardada'); alGuardar() },
    onError: error,
  })
  const archivar = useMutation({ mutationFn: () => tablero.archivarColumna(columna.id), onSuccess: alGuardar, onError: error })

  return (
    <li className="config__columna" style={{ '--c': f.color } as React.CSSProperties}>
      <div className="config__orden">
        <button className="btn btn-fantasma btn-icono btn-chico" disabled={primera} onClick={alSubir} aria-label="Subir"><ArrowUp size={14} /></button>
        <button className="btn btn-fantasma btn-icono btn-chico" disabled={ultima} onClick={alBajar} aria-label="Bajar"><ArrowDown size={14} /></button>
      </div>
      <input type="color" className="config__color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value.toUpperCase() })} aria-label="Color" />
      <div className="config__textos">
        <input className="entrada" value={f.nombre} maxLength={60} onChange={(e) => setF({ ...f, nombre: e.target.value })} aria-label="Nombre" />
        <input className="entrada" value={f.descripcion} maxLength={200} placeholder="Descripción corta" onChange={(e) => setF({ ...f, descripcion: e.target.value })} aria-label="Descripción" />
      </div>
      <select className="entrada config__icono" value={f.icono} onChange={(e) => setF({ ...f, icono: e.target.value })} aria-label="Icono">
        {ICONOS.map((i) => <option key={i} value={i}>{i}</option>)}
      </select>
      <input className="entrada config__limite" type="number" min={1} max={500} placeholder="Sin límite" value={f.limite} onChange={(e) => setF({ ...f, limite: e.target.value })} title="Máximo de pedidos en esta columna" aria-label="Límite" />
      <label className={`chip config__final ${f.es_final ? 'activo' : ''}`} title="Llegar aquí = pedido terminado">
        <input type="checkbox" hidden checked={f.es_final} onChange={(e) => setF({ ...f, es_final: e.target.checked })} />
        <Flag size={13} /> Final
      </label>
      {columna.es_inicial && <span className="chip" title="Aquí caen los pedidos nuevos">Inicial</span>}
      <button className="btn btn-primario btn-icono" disabled={!cambio || guardar.isPending || !f.nombre.trim()} onClick={() => guardar.mutate()} aria-label="Guardar"><Save size={16} /></button>
      {!columna.es_inicial && (
        <button className="btn btn-fantasma btn-icono btn-peligro" onClick={() => window.confirm(`¿Archivar «${columna.nombre}»? Tiene que estar vacía.`) && archivar.mutate()} aria-label="Archivar"><Archive size={16} /></button>
      )}
    </li>
  )
}

function CorreosConfig({ valor }: { valor: string }) {
  const qc = useQueryClient()
  const [sel, setSel] = useState(() => new Set(valor.split(',').map((x) => x.trim()).filter(Boolean)))
  const guardar = useMutation({
    mutationFn: () => tablero.guardarConfig('correo.eventos', [...sel].join(',')),
    onSuccess: () => { toast.success('Guardado'); qc.invalidateQueries({ queryKey: ['config'] }) },
    onError: error,
  })

  return (
    <section className="admin__seccion vidrio">
      <div className="detalles__titulo-bloque">
        <div>
          <h2>¿Qué manda correo a Outlook?</h2>
          <p className="sutil">Todo llega a la campanita de la app. Aquí escoges qué además llega al correo.</p>
        </div>
        <button className="btn btn-primario" onClick={() => guardar.mutate()} disabled={guardar.isPending}><Save size={16} /> Guardar</button>
      </div>
      <div className="config__eventos">
        {EVENTOS.map((e) => (
          <label key={e.id} className={`config__evento ${sel.has(e.id) ? 'activo' : ''}`}>
            <input type="checkbox" checked={sel.has(e.id)} onChange={() => setSel((s) => {
              const n = new Set(s)
              if (n.has(e.id)) n.delete(e.id)
              else n.add(e.id)
              return n
            })} />
            <span className="admin__interruptor-mini" />
            {e.texto}
          </label>
        ))}
      </div>
    </section>
  )
}

function DiasVisibles({ valor }: { valor: string }) {
  const qc = useQueryClient()
  const [dias, setDias] = useState(valor)
  const guardar = useMutation({
    mutationFn: () => tablero.guardarConfig('tablero.dias_visibles_terminados', String(Math.max(1, Number(dias) || 30))),
    onSuccess: () => { toast.success('Guardado'); qc.invalidateQueries({ queryKey: ['config'] }); qc.invalidateQueries({ queryKey: ['tablero'] }) },
    onError: error,
  })
  return (
    <section className="admin__seccion vidrio">
      <div className="detalles__titulo-bloque">
        <div>
          <h2>Pedidos terminados</h2>
          <p className="sutil">Cuántos días se siguen viendo en la columna final antes de esconderse.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="entrada" type="number" min={1} max={365} value={dias} onChange={(e) => setDias(e.target.value)} style={{ width: 100 }} />
          <button className="btn btn-primario" onClick={() => guardar.mutate()} disabled={guardar.isPending || dias === valor}><Save size={16} /></button>
        </div>
      </div>
    </section>
  )
}

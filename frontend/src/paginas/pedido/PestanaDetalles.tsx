import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { pedidos, usuarios } from '@/api/endpoints'
import type { Etiqueta, PedidoDetalle, Prioridad } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Avatar } from '@/componentes/Avatar'
import { EditorPiezas, nuevaPieza, type PiezaEditable } from '@/componentes/EditorPiezas'
import { diasPara, fechaCorta, NOMBRE_PRIORIDAD } from '@/utiles/formato'

const PRIORIDADES: Prioridad[] = ['baja', 'media', 'alta', 'urgente']

export function PestanaDetalles({ pedido, etiquetas }: { pedido: PedidoDetalle; etiquetas: Etiqueta[] }) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)

  const alGuardar = (p: PedidoDetalle) => {
    qc.setQueryData(['pedido', p.id], p)
    qc.invalidateQueries({ queryKey: ['tablero'] })
  }

  return (
    <div className="detalles">
      {editando ? (
        <FormularioEdicion pedido={pedido} etiquetas={etiquetas} alTerminar={(p) => { if (p) alGuardar(p); setEditando(false) }} />
      ) : (
        <>
          <section className="detalles__bloque">
            <div className="detalles__titulo-bloque">
              <h3>Vehículo</h3>
              {pedido.puedo_editar && (
                <button className="btn btn-chico" onClick={() => setEditando(true)}><Pencil size={14} /> Editar</button>
              )}
            </div>
            <dl className="detalles__datos">
              <Dato nombre="Vehículo" valor={pedido.vehiculo} />
              <Dato nombre="Modelo" valor={pedido.modelo} />
              <Dato nombre="Año" valor={pedido.anio} />
              <Dato nombre="VIN" valor={pedido.vin} mono />
              <Dato nombre="Cliente" valor={pedido.cliente} />
              <Dato nombre="Fecha requerida" valor={pedido.fecha_requerida ? <FechaRequerida fecha={pedido.fecha_requerida} /> : null} />
            </dl>
            {pedido.descripcion && <p className="detalles__descripcion">{pedido.descripcion}</p>}
            {pedido.etiquetas.length > 0 && (
              <div className="detalles__etiquetas">
                {pedido.etiquetas.map((e) => <span key={e.id} className="chip" style={{ background: `${e.color}33`, borderColor: `${e.color}88` }}>{e.nombre}</span>)}
              </div>
            )}
          </section>

          <section className="detalles__bloque">
            <div className="detalles__titulo-bloque">
              <h3>Piezas <span className="sutil">({pedido.total_piezas})</span></h3>
            </div>
            <ul className="detalles__piezas">
              {pedido.piezas.map((p) => (
                <li key={p.id}>
                  <span className="detalles__cantidad">×{p.cantidad}</span>
                  <div>
                    <strong>{p.nombre}</strong>
                    {p.observacion && <p>{p.observacion}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <Asignados pedido={pedido} editable={puede('pedido.editar')} alGuardar={alGuardar} />
      <Checklist pedido={pedido} alGuardar={alGuardar} />
    </div>
  )
}

function Dato({ nombre, valor, mono }: { nombre: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt>{nombre}</dt>
      <dd className={mono ? 'mono' : ''}>{valor ?? <span className="sutil">—</span>}</dd>
    </div>
  )
}

function FechaRequerida({ fecha }: { fecha: string }) {
  const dias = diasPara(fecha) ?? 0
  const texto = dias < 0 ? `vencida hace ${-dias} d` : dias === 0 ? 'es hoy' : `faltan ${dias} d`
  return (
    <span>
      {fechaCorta(fecha)} <small className={dias < 0 ? 'texto-peligro' : dias <= 2 ? 'texto-alerta' : 'sutil'}>({texto})</small>
    </span>
  )
}

function FormularioEdicion({ pedido, etiquetas, alTerminar }: { pedido: PedidoDetalle; etiquetas: Etiqueta[]; alTerminar: (p?: PedidoDetalle) => void }) {
  const [f, setF] = useState({
    vehiculo: pedido.vehiculo,
    modelo: pedido.modelo ?? '',
    anio: pedido.anio ? String(pedido.anio) : '',
    vin: pedido.vin ?? '',
    cliente: pedido.cliente ?? '',
    descripcion: pedido.descripcion ?? '',
    prioridad: pedido.prioridad,
    fecha_requerida: pedido.fecha_requerida ?? '',
  })
  const [piezas, setPiezas] = useState<PiezaEditable[]>(() => pedido.piezas.map((p) => ({ ...nuevaPieza(p.nombre), cantidad: p.cantidad, observacion: p.observacion ?? '' })))
  const [etiquetasSel, setEtiquetasSel] = useState<number[]>(pedido.etiquetas.map((e) => e.id))

  const guardar = useMutation({
    mutationFn: () => pedidos.editar(pedido.id, {
      version: pedido.version,
      vehiculo: f.vehiculo,
      modelo: f.modelo || null,
      anio: f.anio ? Number(f.anio) : null,
      vin: f.vin || null,
      cliente: f.cliente || null,
      descripcion: f.descripcion || null,
      prioridad: f.prioridad,
      fecha_requerida: f.fecha_requerida || null,
      piezas: piezas.filter((p) => p.nombre.trim()).map(({ nombre, cantidad, observacion }) => ({ nombre, cantidad, observacion: observacion || null })),
      etiquetas: etiquetasSel,
    }),
    onSuccess: (p) => {
      toast.success('Cambios guardados')
      alTerminar(p)
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  })

  const campo = (clave: keyof typeof f) => ({
    value: f[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [clave]: e.target.value }),
  })

  return (
    <form className="detalles__bloque detalles__form" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
      <div className="detalles__titulo-bloque">
        <h3>Editando pedido</h3>
      </div>
      <div className="rejilla-2">
        <div className="campo"><label>Vehículo</label><input className="entrada" required {...campo('vehiculo')} /></div>
        <div className="campo"><label>Modelo</label><input className="entrada" {...campo('modelo')} /></div>
        <div className="campo"><label>Año</label><input className="entrada" type="number" min={1950} max={2100} {...campo('anio')} /></div>
        <div className="campo"><label>VIN</label><input className="entrada mono" maxLength={17} {...campo('vin')} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} /></div>
        <div className="campo"><label>Cliente</label><input className="entrada" {...campo('cliente')} /></div>
        <div className="campo"><label>Fecha requerida</label><input className="entrada" type="date" {...campo('fecha_requerida')} /></div>
      </div>
      <div className="campo">
        <label>Prioridad</label>
        <div className="selector-prioridad">
          {PRIORIDADES.map((p) => (
            <button type="button" key={p} className={f.prioridad === p ? 'activa' : ''} style={{ '--p': `var(--prioridad-${p})` } as React.CSSProperties} onClick={() => setF({ ...f, prioridad: p })}>
              {NOMBRE_PRIORIDAD[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="campo"><label>Descripción</label><textarea className="entrada" {...campo('descripcion')} /></div>
      <div className="campo">
        <label>Etiquetas</label>
        <div className="detalles__etiquetas">
          {etiquetas.map((e) => {
            const activa = etiquetasSel.includes(e.id)
            return (
              <button type="button" key={e.id} className="chip" style={activa ? { background: `${e.color}44`, borderColor: e.color } : undefined}
                onClick={() => setEtiquetasSel((s) => (activa ? s.filter((x) => x !== e.id) : [...s, e.id]))}>
                <span className="punto" style={{ background: e.color }} /> {e.nombre}
              </button>
            )
          })}
        </div>
      </div>
      <div className="campo"><label>Piezas</label><EditorPiezas piezas={piezas} onChange={setPiezas} /></div>
      <div className="detalles__botones">
        <button type="button" className="btn" onClick={() => alTerminar()}><X size={16} /> Cancelar</button>
        <button className="btn btn-primario" disabled={guardar.isPending || !piezas.some((p) => p.nombre.trim())}>
          <Check size={16} /> {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function Asignados({ pedido, editable, alGuardar }: { pedido: PedidoDetalle; editable: boolean; alGuardar: (p: PedidoDetalle) => void }) {
  const [abierto, setAbierto] = useState(false)
  const { data: equipo = [] } = useQuery({ queryKey: ['equipo'], queryFn: usuarios.equipo, enabled: editable, staleTime: 300000 })
  const asignados = pedido.miembros.filter((m) => m.tipo === 'asignado').map((m) => m.usuario)
  const seguidores = pedido.miembros.filter((m) => m.tipo === 'seguidor').map((m) => m.usuario)

  const asignar = useMutation({
    mutationFn: (ids: number[]) => pedidos.asignar(pedido.id, ids),
    onSuccess: alGuardar,
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo asignar'),
  })

  const alternar = (id: number) => {
    const ids = asignados.map((u) => u.id)
    asignar.mutate(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  }

  return (
    <section className="detalles__bloque">
      <div className="detalles__titulo-bloque">
        <h3>Responsables</h3>
        {editable && <button className="btn btn-chico" onClick={() => setAbierto((a) => !a)}>{abierto ? 'Listo' : <><Plus size={14} /> Asignar</>}</button>}
      </div>
      {abierto ? (
        <div className="detalles__equipo">
          {equipo.map((u) => {
            const activo = asignados.some((a) => a.id === u.id)
            return (
              <button key={u.id} className={`detalles__persona ${activo ? 'activa' : ''}`} onClick={() => alternar(u.id)} disabled={asignar.isPending}>
                <Avatar usuario={u} tamano={30} />
                <span>{u.nombre}</span>
                {activo && <Check size={16} />}
              </button>
            )
          })}
        </div>
      ) : asignados.length ? (
        <div className="detalles__personas">
          {asignados.map((u) => <span key={u.id} className="chip detalles__chip-persona"><Avatar usuario={u} tamano={20} /> {u.nombre}</span>)}
        </div>
      ) : (
        <p className="sutil">Nadie asignado todavía.</p>
      )}
      {seguidores.length > 0 && <p className="sutil detalles__seguidores">Lo siguen: {seguidores.map((u) => u.nombre).join(', ')}</p>}
    </section>
  )
}

function Checklist({ pedido, alGuardar }: { pedido: PedidoDetalle; alGuardar: (p: PedidoDetalle) => void }) {
  const [texto, setTexto] = useState('')
  const error = (e: unknown) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar')
  const agregar = useMutation({ mutationFn: () => pedidos.agregarItem(pedido.id, texto), onSuccess: (p) => { setTexto(''); alGuardar(p) }, onError: error })
  const marcar = useMutation({ mutationFn: (v: { id: number; hecho: boolean }) => pedidos.editarItem(v.id, { hecho: v.hecho }), onSuccess: alGuardar, onError: error })
  const borrar = useMutation({ mutationFn: (id: number) => pedidos.borrarItem(id), onSuccess: alGuardar, onError: error })

  const hechos = pedido.checklist.filter((c) => c.hecho).length
  const total = pedido.checklist.length

  return (
    <section className="detalles__bloque">
      <div className="detalles__titulo-bloque">
        <h3>Checklist {total > 0 && <span className="sutil">({hechos}/{total})</span>}</h3>
      </div>
      {total > 0 && (
        <div className="tarjeta__progreso" style={{ marginTop: 0 }}>
          <span style={{ width: `${(hechos / total) * 100}%` }} />
        </div>
      )}
      <ul className="checklist">
        {pedido.checklist.map((c) => (
          <li key={c.id} className={c.hecho ? 'hecho' : ''}>
            <label>
              <input
                type="checkbox"
                checked={c.hecho}
                disabled={!pedido.puedo_editar || marcar.isPending}
                onChange={(e) => marcar.mutate({ id: c.id, hecho: e.target.checked })}
              />
              <span className="checklist__caja"><Check size={13} /></span>
              <span>{c.texto}</span>
            </label>
            {pedido.puedo_editar && (
              <button className="btn btn-fantasma btn-icono btn-chico" onClick={() => borrar.mutate(c.id)} aria-label="Quitar"><Trash2 size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {pedido.puedo_editar && (
        <form className="checklist__nuevo" onSubmit={(e) => { e.preventDefault(); if (texto.trim()) agregar.mutate() }}>
          <input className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Agregar un paso: 'Validar medidas en sitio'…" maxLength={300} />
          <button className="btn" disabled={!texto.trim() || agregar.isPending}><Plus size={16} /></button>
        </form>
      )}
    </section>
  )
}

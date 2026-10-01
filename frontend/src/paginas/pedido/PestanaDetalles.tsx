import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { pedidos, tablero, usuarios } from '@/api/endpoints'
import { ponerAsignados, refrescarPronto } from '@/api/cacheLocal'
import type { Columna, Etiqueta, ItemChecklist, PedidoDetalle, Prioridad, TipoVidrio, UsuarioMini } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Avatar } from '@/componentes/Avatar'
import { EditorPiezas, nuevaPieza, type PiezaEditable } from '@/componentes/EditorPiezas'
import { diasPara, fechaCorta, NOMBRE_PRIORIDAD } from '@/utiles/formato'
import { BloqueIngreso } from './BloqueIngreso'

const PRIORIDADES: Prioridad[] = ['baja', 'media', 'alta', 'urgente']

export function PestanaDetalles({ pedido, etiquetas, columnas }: { pedido: PedidoDetalle; etiquetas: Etiqueta[]; columnas: Columna[] }) {
  const { puede } = useAuth()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)

  const alGuardar = (p: PedidoDetalle) => {
    qc.setQueryData(['pedido', p.id], p)
    qc.invalidateQueries({ queryKey: ['tablero'] })
  }

  return (
    <div className="detalles">
      <BloqueIngreso pedido={pedido} columnas={columnas} />
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
              <Dato nombre="Marca" valor={pedido.marca} />
              <Dato nombre="Modelo" valor={pedido.modelo} />
              <Dato nombre="Versión" valor={pedido.version_vehiculo} />
              <Dato nombre="Plataforma / código" valor={pedido.plataforma} mono />
              <Dato nombre="Año" valor={pedido.anio} />
              <Dato nombre="Mercado" valor={pedido.mercado} />
              <Dato
                nombre="Vidrio"
                valor={pedido.tipo_vidrio === '3d'
                  ? <>3D <small className={pedido.info_en_drive ? 'texto-exito' : 'texto-alerta'}>({pedido.info_en_drive ? 'info en Drive' : 'aún no está en Drive'})</small></>
                  : 'Original'}
              />
              {pedido.fecha_requerida && <Dato nombre="Fecha requerida" valor={<FechaRequerida fecha={pedido.fecha_requerida} />} />}
            </dl>
            <div className="detalles__vin">
              <dt>VIN</dt>
              <dd className="mono">{pedido.vin}</dd>
            </div>
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
                  <span className="piezas__codigo mono">{p.codigo ?? '—'}</span>
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

      <Asignados pedido={pedido} editable={puede('pedido.editar')} />
      <Checklist pedido={pedido} />
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

type CampoTexto = 'marca' | 'modelo' | 'version_vehiculo' | 'plataforma' | 'anio' | 'vin' | 'mercado' | 'descripcion' | 'fecha_requerida'

function FormularioEdicion({ pedido, etiquetas, alTerminar }: { pedido: PedidoDetalle; etiquetas: Etiqueta[]; alTerminar: (p?: PedidoDetalle) => void }) {
  const { puede } = useAuth()
  // prioridad y fecha ya no las pone el comercial; solo el equipo interno si las necesita
  const equipoInterno = puede('pedido.editar')
  const { data: catalogos } = useQuery({ queryKey: ['catalogos'], queryFn: tablero.catalogos, staleTime: 600000 })
  const [f, setF] = useState({
    marca: pedido.marca,
    modelo: pedido.modelo,
    version_vehiculo: pedido.version_vehiculo ?? '',
    plataforma: pedido.plataforma ?? '',
    anio: pedido.anio ? String(pedido.anio) : '',
    vin: pedido.vin,
    mercado: pedido.mercado,
    tipo_vidrio: pedido.tipo_vidrio as TipoVidrio,
    info_en_drive: pedido.info_en_drive,
    descripcion: pedido.descripcion ?? '',
    prioridad: pedido.prioridad,
    fecha_requerida: pedido.fecha_requerida ?? '',
  })
  const [piezas, setPiezas] = useState<PiezaEditable[]>(() => pedido.piezas.map((p) => nuevaPieza(p.nombre, p.codigo ?? null, p.observacion ?? '')))
  const [etiquetasSel, setEtiquetasSel] = useState<number[]>(pedido.etiquetas.map((e) => e.id))
  const faltaDrive = f.tipo_vidrio === '3d' && f.info_en_drive === null

  const guardar = useMutation({
    mutationFn: () => pedidos.editar(pedido.id, {
      version: pedido.version,
      marca: f.marca,
      modelo: f.modelo,
      version_vehiculo: f.version_vehiculo || null,
      plataforma: f.plataforma || null,
      anio: f.anio ? Number(f.anio) : null,
      vin: f.vin,
      mercado: f.mercado,
      tipo_vidrio: f.tipo_vidrio,
      info_en_drive: f.tipo_vidrio === '3d' ? f.info_en_drive : null,
      descripcion: f.descripcion || null,
      ...(equipoInterno ? { prioridad: f.prioridad, fecha_requerida: f.fecha_requerida || null } : {}),
      piezas: piezas.map(({ codigo, nombre, observacion }) => ({ codigo: codigo ?? null, nombre, observacion: observacion || null })),
      etiquetas: etiquetasSel,
    }),
    onSuccess: (p) => {
      toast.success('Cambios guardados')
      alTerminar(p)
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  })

  const campo = (clave: CampoTexto) => ({
    value: f[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [clave]: e.target.value }),
  })

  return (
    <form className="detalles__bloque detalles__form" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
      <div className="detalles__titulo-bloque">
        <h3>Editando pedido</h3>
      </div>
      <div className="rejilla-2">
        <div className="campo"><label>Marca *</label><input className="entrada" required {...campo('marca')} /></div>
        <div className="campo"><label>Modelo *</label><input className="entrada" required {...campo('modelo')} /></div>
        <div className="campo"><label>Versión</label><input className="entrada" {...campo('version_vehiculo')} /></div>
        <div className="campo"><label>Plataforma / código</label><input className="entrada mono" {...campo('plataforma')} /></div>
        <div className="campo"><label>Año</label><input className="entrada" type="number" min={1950} max={2100} {...campo('anio')} /></div>
        <div className="campo">
          <label>Mercado *</label>
          <select className="entrada" required {...campo('mercado')}>
            {/* si el mercado guardado ya no esta en la lista, igual se muestra */}
            {[...new Set([f.mercado, ...(catalogos?.mercados ?? [])])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="campo"><label>VIN *</label><textarea className="entrada mono nuevo__vin-libre" rows={1} required {...campo('vin')} /></div>
      <div className="campo">
        <label>Vidrio</label>
        <div className="selector-prioridad">
          {(['original', '3d'] as TipoVidrio[]).map((t) => (
            <button type="button" key={t} className={f.tipo_vidrio === t ? 'activa' : ''} style={{ '--p': 'var(--primario)' } as React.CSSProperties}
              onClick={() => setF({ ...f, tipo_vidrio: t, info_en_drive: t === 'original' ? null : f.info_en_drive })}>
              {t === '3d' ? '3D' : 'Original'}
            </button>
          ))}
        </div>
      </div>
      {f.tipo_vidrio === '3d' && (
        <div className="campo">
          <label>¿La información ya está en Drive? *</label>
          <div className="selector-prioridad">
            {[true, false].map((v) => (
              <button type="button" key={String(v)} className={f.info_en_drive === v ? 'activa' : ''} style={{ '--p': v ? 'var(--exito)' : 'var(--alerta)' } as React.CSSProperties}
                onClick={() => setF({ ...f, info_en_drive: v })}>
                {v ? 'Sí, ya está' : 'Todavía no'}
              </button>
            ))}
          </div>
        </div>
      )}
      {equipoInterno && (
        <div className="rejilla-2">
          <div className="campo">
            <label>Prioridad <span className="sutil">(interno)</span></label>
            <select className="entrada" value={f.prioridad} onChange={(e) => setF({ ...f, prioridad: e.target.value as Prioridad })}>
              {PRIORIDADES.map((p) => <option key={p} value={p}>{NOMBRE_PRIORIDAD[p]}</option>)}
            </select>
          </div>
          <div className="campo"><label>Fecha requerida <span className="sutil">(interno)</span></label><input className="entrada" type="date" {...campo('fecha_requerida')} /></div>
        </div>
      )}
      <div className="campo"><label>Comentarios</label><textarea className="entrada" {...campo('descripcion')} /></div>
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
      <div className="campo"><label>Piezas</label><EditorPiezas piezas={piezas} onChange={setPiezas} catalogo={catalogos?.piezas ?? []} /></div>
      <div className="detalles__botones">
        <button type="button" className="btn" onClick={() => alTerminar()}><X size={16} /> Cancelar</button>
        <button className="btn btn-primario" disabled={guardar.isPending || !piezas.length || faltaDrive}>
          <Check size={16} /> {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}

function Asignados({ pedido, editable }: { pedido: PedidoDetalle; editable: boolean }) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [abierto, setAbierto] = useState(false)
  const [buscar, setBuscar] = useState('')
  const { data: equipo = [] } = useQuery({ queryKey: ['equipo'], queryFn: usuarios.equipo, enabled: editable, staleTime: 300000 })
  const asignados = pedido.miembros.filter((m) => m.tipo === 'asignado').map((m) => m.usuario)
  const seguidores = pedido.miembros.filter((m) => m.tipo === 'seguidor').map((m) => m.usuario)
  const clave = ['asignar', pedido.id]
  const envio = useRef<number>(0)

  // Cada clic cambia la pantalla AL INSTANTE (sin esperar a nadie). Lo que se
  // manda al servidor espera 400 ms desde el ultimo clic: si das 4 clics
  // rapidos (o te equivocas y corriges), sale UNA sola peticion con la lista final.
  const asignar = useMutation({
    mutationKey: clave,
    scope: { id: `asignar-${pedido.id}` },
    mutationFn: (ids: number[]) => pedidos.asignar(pedido.id, ids),
    onError: (e) => {
      toast.error(e instanceof ErrorApi ? e.message : 'No se pudo asignar')
      qc.invalidateQueries({ queryKey: ['pedido', pedido.id] })  // volvemos a lo que diga el servidor
    },
    onSuccess: (p) => {
      // solo la respuesta mas nueva, y solo su pedazo (miembros): si pisaramos
      // el pedido completo borrariamos, por ejemplo, un paso de checklist recien agregado
      if (qc.isMutating({ mutationKey: clave }) <= 1 && !envio.current) {
        qc.setQueryData<PedidoDetalle>(['pedido', p.id], (actual) => actual && { ...actual, miembros: p.miembros })
        refrescarPronto(qc, ['tablero'])
      }
    },
  })

  const alternar = (u: UsuarioMini) => {
    const actual = qc.getQueryData<PedidoDetalle>(['pedido', pedido.id])?.miembros ?? pedido.miembros
    const lista = actual.filter((m) => m.tipo === 'asignado').map((m) => m.usuario)
    const nueva = lista.some((x) => x.id === u.id) ? lista.filter((x) => x.id !== u.id) : [...lista, u]
    qc.cancelQueries({ queryKey: ['pedido', pedido.id] })
    ponerAsignados(qc, pedido.id, nueva)  // en pantalla ya
    window.clearTimeout(envio.current)
    envio.current = window.setTimeout(() => {
      envio.current = 0
      const final = qc.getQueryData<PedidoDetalle>(['pedido', pedido.id])?.miembros ?? []
      asignar.mutate(final.filter((m) => m.tipo === 'asignado').map((m) => m.usuario.id))
    }, 400)
  }

  // si se cierra el panel con un cambio esperando, se manda de una (no se pierde)
  useEffect(() => () => {
    if (envio.current) {
      window.clearTimeout(envio.current)
      const final = qc.getQueryData<PedidoDetalle>(['pedido', pedido.id])?.miembros ?? []
      pedidos.asignar(pedido.id, final.filter((m) => m.tipo === 'asignado').map((m) => m.usuario.id))
        .catch(() => toast.error('No se pudo guardar el último cambio de responsables'))
    }
  }, [pedido.id, qc])

  const yoAsignado = usuario && asignados.some((a) => a.id === usuario.id)
  const q = buscar.trim().toLowerCase()
  const filtrados = equipo
    .filter((u) => !q || u.nombre.toLowerCase().includes(q) || u.usuario.includes(q))
    // los asignados primero, para quitarlos rapido
    .sort((a, b) => Number(asignados.some((x) => x.id === b.id)) - Number(asignados.some((x) => x.id === a.id)))

  return (
    <section className="detalles__bloque">
      <div className="detalles__titulo-bloque">
        <h3>Responsables {asignados.length > 0 && <span className="sutil">({asignados.length})</span>}</h3>
        {editable && (
          <div className="detalles__acciones-bloque">
            {usuario && !yoAsignado && (
              <button className="btn btn-chico" onClick={() => alternar(usuario)}><UserPlus size={14} /> Asignarme</button>
            )}
            <button className="btn btn-chico" onClick={() => { setAbierto((a) => !a); setBuscar('') }}>
              {abierto ? <><Check size={14} /> Listo</> : <><Plus size={14} /> Asignar</>}
            </button>
          </div>
        )}
      </div>

      {asignados.length > 0 ? (
        <div className="detalles__personas">
          <AnimatePresence initial={false}>
            {asignados.map((u) => (
              <motion.span
                key={u.id}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12 } }}
                className="chip detalles__chip-persona"
              >
                <Avatar usuario={u} tamano={20} /> {u.nombre}
                {editable && (
                  <button className="detalles__quitar" onClick={() => alternar(u)} aria-label={`Quitar a ${u.nombre}`} title="Quitar">
                    <X size={13} />
                  </button>
                )}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        !abierto && <p className="sutil">Nadie asignado todavía.</p>
      )}

      <AnimatePresence>
        {abierto && (
          <motion.div className="detalles__selector" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <input
              className="entrada"
              autoFocus
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              onKeyDown={(e) => {
                // stopPropagation: este Escape cierra SOLO el selector, no le llega al panel del pedido
                if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false) }
                // Enter asigna/quita al primero de la lista filtrada
                if (e.key === 'Enter' && filtrados[0]) { e.preventDefault(); alternar(filtrados[0]); setBuscar('') }
              }}
              placeholder="Buscar persona… (Enter asigna al primero)"
            />
            <div className="detalles__equipo">
              {filtrados.map((u) => {
                const activo = asignados.some((a) => a.id === u.id)
                return (
                  <button key={u.id} className={`detalles__persona ${activo ? 'activa' : ''}`} onClick={() => alternar(u)}>
                    <Avatar usuario={u} tamano={30} />
                    <span className="detalles__persona-nombre">{u.nombre}</span>
                    {activo ? <Check size={16} /> : <Plus size={15} className="sutil" />}
                  </button>
                )
              })}
              {filtrados.length === 0 && <p className="sutil">Nadie con ese nombre.</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {seguidores.length > 0 && <p className="sutil detalles__seguidores">Lo siguen: {seguidores.map((u) => u.nombre).join(', ')}</p>}
    </section>
  )
}

type ItemLocal = ItemChecklist & { pendiente?: boolean }

function Checklist({ pedido }: { pedido: PedidoDetalle }) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const clave = ['checklist', pedido.id]

  const ponerLista = (fn: (l: ItemLocal[]) => ItemLocal[]) => {
    qc.cancelQueries({ queryKey: ['pedido', pedido.id] })
    qc.setQueryData<PedidoDetalle>(['pedido', pedido.id], (p) => p && { ...p, checklist: fn(p.checklist) })
  }

  // mismo truco que en responsables: todo se ve al instante; al confirmar, solo
  // la respuesta mas nueva y solo su pedazo (la checklist) toca la pantalla
  const opciones = {
    mutationKey: clave,
    scope: { id: `checklist-${pedido.id}` },
    onError: (e: unknown) => {
      toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar')
      qc.invalidateQueries({ queryKey: ['pedido', pedido.id] })
    },
    onSuccess: (p: PedidoDetalle) => {
      if (qc.isMutating({ mutationKey: clave }) <= 1) {
        qc.setQueryData<PedidoDetalle>(['pedido', p.id], (actual) => actual && { ...actual, checklist: p.checklist })
        refrescarPronto(qc, ['tablero'])
      }
    },
  }

  const agregar = useMutation({ ...opciones, mutationFn: (t: string) => pedidos.agregarItem(pedido.id, t) })
  const marcar = useMutation({ ...opciones, mutationFn: (v: { id: number; hecho: boolean }) => pedidos.editarItem(v.id, { hecho: v.hecho }) })
  const borrar = useMutation({ ...opciones, mutationFn: (id: number) => pedidos.borrarItem(id) })

  const nuevoPaso = (t: string) => {
    ponerLista((l) => [...l, { id: -Date.now(), texto: t, hecho: false, orden: l.length, pendiente: true }])
    agregar.mutate(t)
  }
  const marcarPaso = (id: number, hecho: boolean) => {
    ponerLista((l) => l.map((c) => (c.id === id ? { ...c, hecho } : c)))
    marcar.mutate({ id, hecho })
  }
  const borrarPaso = (id: number) => {
    ponerLista((l) => l.filter((c) => c.id !== id))
    borrar.mutate(id)
  }

  const lista = pedido.checklist as ItemLocal[]
  const hechos = lista.filter((c) => c.hecho).length
  const total = lista.length

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
        {lista.map((c) => (
          <li key={c.id} className={`${c.hecho ? 'hecho' : ''} ${c.pendiente ? 'pendiente' : ''}`}>
            <label>
              <input
                type="checkbox"
                checked={c.hecho}
                // un item recien creado todavia no tiene id real: no se puede marcar hasta que llegue
                disabled={!pedido.puedo_editar || c.pendiente}
                onChange={(e) => marcarPaso(c.id, e.target.checked)}
              />
              <span className="checklist__caja"><Check size={13} /></span>
              <span>{c.texto}</span>
            </label>
            {pedido.puedo_editar && !c.pendiente && (
              <button className="btn btn-fantasma btn-icono btn-chico" onClick={() => borrarPaso(c.id)} aria-label="Quitar"><Trash2 size={14} /></button>
            )}
          </li>
        ))}
      </ul>
      {pedido.puedo_editar && (
        <form className="checklist__nuevo" onSubmit={(e) => {
          e.preventDefault()
          const t = texto.trim()
          if (!t) return
          nuevoPaso(t)
          setTexto('')
        }}>
          <input className="entrada" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Agregar un paso: 'Validar medidas en sitio'…" maxLength={300} />
          <button className="btn" disabled={!texto.trim()}><Plus size={16} /></button>
        </form>
      )}
    </section>
  )
}

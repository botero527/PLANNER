import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { CornerUpLeft, FileText, Paperclip, Pencil, SendHorizontal, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { adjuntos, chat, usuarios } from '@/api/endpoints'
import { useEvento, useTiempoReal } from '@/api/tiempoReal'
import type { Mensaje, PedidoDetalle, UsuarioMini } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Avatar } from '@/componentes/Avatar'
import { Personaje } from '@/componentes/personajes/Personaje'
import { hora, primerNombre, tamanoArchivo } from '@/utiles/formato'

// mensajes seguidos del mismo autor en menos de 5 min se agrupan (como Teams)
const VENTANA_GRUPO = 5 * 60 * 1000

export function PestanaChat({ pedido }: { pedido: PedidoDetalle }) {
  const { usuario, puede } = useAuth()
  const { enviar: enviarWs } = useTiempoReal()
  const qc = useQueryClient()
  const lista = useRef<HTMLDivElement>(null)
  const [texto, setTexto] = useState('')
  const [respondiendo, setRespondiendo] = useState<Mensaje | null>(null)
  const [editando, setEditando] = useState<Mensaje | null>(null)
  const [archivos, setArchivos] = useState<File[]>([])
  const [escribiendo, setEscribiendo] = useState<Record<number, { nombre: string; hasta: number }>>({})
  const [mencion, setMencion] = useState<string | null>(null)
  const ultimoAviso = useRef(0)

  const { data: mensajes = [], isLoading } = useQuery({ queryKey: ['mensajes', pedido.id], queryFn: () => chat.mensajes(pedido.id) })
  const { data: equipo = [] } = useQuery({ queryKey: ['equipo'], queryFn: usuarios.equipo, staleTime: 300000 })
  const porId = useMemo(() => new Map(mensajes.map((m) => [m.id, m])), [mensajes])

  // bajar al ultimo mensaje cuando llega uno nuevo
  useEffect(() => {
    lista.current?.scrollTo({ top: lista.current.scrollHeight, behavior: mensajes.length ? 'smooth' : 'auto' })
  }, [mensajes.length])

  useEvento((e) => {
    if (e.tipo === 'escribiendo' && e.pedido_id === pedido.id && e.usuario.id !== usuario?.id) {
      setEscribiendo((x) => ({ ...x, [e.usuario.id]: { nombre: e.usuario.nombre, hasta: Date.now() + 3500 } }))
    }
    if (e.tipo === 'chat.mensaje' && e.pedido_id === pedido.id) {
      setEscribiendo((x) => {
        const { [e.mensaje.autor.id]: _, ...resto } = x
        return resto
      })
    }
  })

  // limpiar los "escribiendo…" viejos
  useEffect(() => {
    const t = window.setInterval(() => setEscribiendo((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v.hasta > Date.now()))), 1000)
    return () => window.clearInterval(t)
  }, [])

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['mensajes', pedido.id] })
    qc.invalidateQueries({ queryKey: ['pedido', pedido.id] })
  }

  // Cada envio lleva SUS datos (no lee el estado del formulario), asi la caja se
  // limpia al instante y uno puede ir escribiendo el siguiente mientras este viaja.
  const enviar = useMutation({
    // scope: los envios del mismo chat van en fila, uno detras del otro, asi
    // nunca llegan en desorden al servidor aunque se manden muy seguido
    scope: { id: `chat-${pedido.id}` },
    mutationFn: async (v: { texto: string; archivos: File[]; respuestaA: number | null; editandoId: number | null }) => {
      const cuerpo = v.texto || (v.archivos.length ? `📎 ${v.archivos.length === 1 ? v.archivos[0].name : `${v.archivos.length} archivos`}` : '')
      if (v.editandoId) return chat.editar(v.editandoId, cuerpo)
      const m = await chat.enviar(pedido.id, cuerpo, v.respuestaA)
      if (v.archivos.length) await adjuntos.subir(pedido.id, v.archivos, m.id)
      return m
    },
    onSuccess: refrescar,
    onError: (e, v) => {
      toast.error(e instanceof ErrorApi ? e.message : 'No se pudo enviar')
      // devolvemos el texto para que no se pierda lo que la persona escribio
      setTexto((actual) => actual || v.texto)
    },
  })

  const mandar = () => {
    const limpio = texto.trim()
    if (!limpio && !archivos.length) return
    enviar.mutate({ texto: limpio, archivos, respuestaA: respondiendo?.id ?? null, editandoId: editando?.id ?? null })
    setTexto('')
    setArchivos([])
    setRespondiendo(null)
    setEditando(null)
    setMencion(null)
  }

  const borrar = useMutation({ mutationFn: (id: number) => chat.eliminar(id), onSuccess: refrescar })

  const alEscribir = (valor: string) => {
    setTexto(valor)
    const m = /@([\w.]*)$/.exec(valor)
    setMencion(m ? m[1].toLowerCase() : null)
    // avisamos "escribiendo" maximo cada 2 segundos, no en cada tecla
    if (Date.now() - ultimoAviso.current > 2000) {
      ultimoAviso.current = Date.now()
      enviarWs({ tipo: 'escribiendo', pedido_id: pedido.id })
    }
  }

  const candidatos = mencion === null ? [] : equipo
    .filter((u) => u.id !== usuario?.id && (u.usuario.includes(mencion) || u.nombre.toLowerCase().includes(mencion)))
    .slice(0, 5)

  const elegirMencion = (u: UsuarioMini) => {
    setTexto((t) => t.replace(/@([\w.]*)$/, `@${u.usuario} `))
    setMencion(null)
  }

  const puedeEnviar = Boolean(texto.trim() || archivos.length > 0)
  const quienEscribe = Object.values(escribiendo).map((x) => primerNombre(x.nombre))

  return (
    <div className="chat">
      <div className="chat__lista" ref={lista}>
        {isLoading ? null : mensajes.length === 0 ? (
          <div className="chat__vacio">
            <Personaje personaje={usuario?.personaje} expresion="feliz" tamano={96} />
            <h4>Arranca la conversación</h4>
            <p>Todo lo que se hable de este pedido queda aquí. Usa <b>@</b> para llamar a alguien.</p>
          </div>
        ) : (
          mensajes.map((m, i) => {
            const anterior = mensajes[i - 1]
            const mismoGrupo = anterior && anterior.autor.id === m.autor.id && !m.respuesta_a_id &&
              new Date(m.creado_en).getTime() - new Date(anterior.creado_en).getTime() < VENTANA_GRUPO
            const nuevoDia = !anterior || new Date(anterior.creado_en).toDateString() !== new Date(m.creado_en).toDateString()
            return (
              <Fragment key={m.id}>
                {nuevoDia && <div className="chat__dia"><span>{new Date(m.creado_en).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>}
                <Burbuja
                  mensaje={m}
                  mio={m.autor.id === usuario?.id}
                  agrupado={Boolean(mismoGrupo) && !nuevoDia}
                  original={m.respuesta_a_id ? porId.get(m.respuesta_a_id) : undefined}
                  alResponder={() => { setRespondiendo(m); setEditando(null) }}
                  alEditar={() => { setEditando(m); setRespondiendo(null); setTexto(m.texto) }}
                  alBorrar={() => window.confirm('¿Borrar este mensaje?') && borrar.mutate(m.id)}
                  puedeBorrarAjeno={puede('usuario.administrar')}
                />
              </Fragment>
            )
          })
        )}
      </div>

      <AnimatePresence>
        {quienEscribe.length > 0 && (
          <motion.div className="chat__escribiendo" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span className="chat__puntos"><i /><i /><i /></span>
            {quienEscribe.join(', ')} {quienEscribe.length === 1 ? 'está' : 'están'} escribiendo…
          </motion.div>
        )}
      </AnimatePresence>

      {puede('chat.escribir') && (
        <form className="chat__caja vidrio" onSubmit={(e) => { e.preventDefault(); mandar() }}>
          {(respondiendo || editando) && (
            <div className="chat__contexto">
              {respondiendo ? <CornerUpLeft size={14} /> : <Pencil size={14} />}
              <span>
                {respondiendo ? <>Respondiendo a <b>{respondiendo.autor.nombre}</b>: {respondiendo.texto.slice(0, 80)}</> : 'Editando mensaje'}
              </span>
              <button type="button" onClick={() => { setRespondiendo(null); if (editando) setTexto(''); setEditando(null) }} aria-label="Cancelar"><X size={14} /></button>
            </div>
          )}
          {archivos.length > 0 && (
            <div className="chat__archivos">
              {archivos.map((a, i) => (
                <span key={i} className="chip">
                  <FileText size={12} /> {a.name} <small>{tamanoArchivo(a.size)}</small>
                  <button type="button" onClick={() => setArchivos((x) => x.filter((_, j) => j !== i))} aria-label="Quitar"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}

          {candidatos.length > 0 && (
            <ul className="chat__menciones vidrio">
              {candidatos.map((u) => (
                <li key={u.id}>
                  <button type="button" onMouseDown={(e) => { e.preventDefault(); elegirMencion(u) }}>
                    <Avatar usuario={u} tamano={24} /> <b>{u.nombre}</b> <span>@{u.usuario}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="chat__fila">
            {!editando && puede('adjunto.subir') && (
              <label className="btn btn-fantasma btn-icono" title="Adjuntar archivos">
                <Paperclip size={18} />
                <input type="file" multiple hidden onChange={(e) => { setArchivos((x) => [...x, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} />
              </label>
            )}
            <textarea
              value={texto}
              onChange={(e) => alEscribir(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && candidatos.length === 0) {
                  e.preventDefault()
                  mandar()
                }
                if (e.key === 'Tab' && candidatos.length) {
                  e.preventDefault()
                  elegirMencion(candidatos[0])
                }
              }}
              placeholder="Escribe un mensaje… (Enter envía, Shift+Enter salta de línea)"
              rows={1}
              maxLength={4000}
            />
            <motion.button className="btn btn-primario btn-icono" disabled={!puedeEnviar} whileTap={{ scale: 0.9 }} aria-label="Enviar">
              <SendHorizontal size={18} />
            </motion.button>
          </div>
        </form>
      )}
    </div>
  )
}

interface PropsBurbuja {
  mensaje: Mensaje
  mio: boolean
  agrupado: boolean
  original?: Mensaje
  alResponder: () => void
  alEditar: () => void
  alBorrar: () => void
  puedeBorrarAjeno: boolean
}

function Burbuja({ mensaje: m, mio, agrupado, original, alResponder, alEditar, alBorrar, puedeBorrarAjeno }: PropsBurbuja) {
  return (
    <motion.div
      className={`msj ${mio ? 'msj--mio' : ''} ${agrupado ? 'msj--agrupado' : ''}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      {!mio && <div className="msj__avatar">{!agrupado && <Avatar usuario={m.autor} tamano={34} />}</div>}
      <div className="msj__contenido">
        {!agrupado && (
          <div className="msj__cabeza">
            {!mio && <b>{m.autor.nombre}</b>}
            <span>{hora(m.creado_en)}</span>
            {m.editado_en && !m.eliminado && <span>· editado</span>}
          </div>
        )}
        <div className="msj__burbuja">
          {original && (
            <div className="msj__cita">
              <b>{original.autor.nombre}</b>
              <span>{original.eliminado ? 'Mensaje eliminado' : original.texto.slice(0, 120)}</span>
            </div>
          )}
          {m.eliminado ? <i className="sutil">Este mensaje se eliminó</i> : <TextoConMenciones texto={m.texto} />}
          {m.adjuntos.length > 0 && (
            <div className="msj__adjuntos">
              {m.adjuntos.map((a) => a.es_imagen ? (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="msj__imagen"><img src={a.url} alt={a.nombre} loading="lazy" /></a>
              ) : (
                <a key={a.id} href={a.url_descarga} className="msj__archivo"><FileText size={16} /> {a.nombre} <small>{tamanoArchivo(a.tamano_bytes)}</small></a>
              ))}
            </div>
          )}
        </div>
        {!m.eliminado && (
          <div className="msj__acciones">
            <button onClick={alResponder} title="Responder"><CornerUpLeft size={14} /></button>
            {mio && <button onClick={alEditar} title="Editar"><Pencil size={14} /></button>}
            {(mio || puedeBorrarAjeno) && <button onClick={alBorrar} title="Borrar"><Trash2 size={14} /></button>}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function TextoConMenciones({ texto }: { texto: string }) {
  // se parte el texto por las @menciones para pintarlas resaltadas. React escapa
  // el texto solo, entonces aqui no hay riesgo de que alguien meta HTML.
  const partes = texto.split(/(@[a-zA-Z0-9._]{3,50})/g)
  return (
    <p className="msj__texto">
      {partes.map((p, i) => (p.startsWith('@') ? <span key={i} className="msj__mencion">{p}</span> : p))}
    </p>
  )
}

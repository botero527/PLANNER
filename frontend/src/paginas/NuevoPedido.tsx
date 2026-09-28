// El formulario del comercial: sencillo, en 3 bloques, con Vendi guiando y
// una vista previa en vivo de como va a quedar la tarjeta en el tablero.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, CarFront, FileText, ImagePlus, KanbanSquare, Puzzle, RotateCcw, Send, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { adjuntos, pedidos, tablero } from '@/api/endpoints'
import type { PedidoDetalle, Prioridad, Tarjeta } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { EditorPiezas, type PiezaEditable } from '@/componentes/EditorPiezas'
import { Personaje, type Expresion } from '@/componentes/personajes/Personaje'
import { TituloBarra } from '@/componentes/TituloBarra'
import { celebrar } from '@/utiles/confeti'
import { NOMBRE_PRIORIDAD, tamanoArchivo } from '@/utiles/formato'
import { TarjetaPedido } from './tablero/TarjetaPedido'
import './nuevo-pedido.css'

const PATRON_VIN = /^[A-HJ-NPR-Z0-9]{17}$/
const PRIORIDADES: Prioridad[] = ['baja', 'media', 'alta', 'urgente']
const ANIO_MAX = new Date().getFullYear() + 2
const MAX_MB = 25

// ojo: toISOString() da la fecha en UTC y en la noche de Colombia ya seria "mañana"
const hoyLocal = () => new Date().toLocaleDateString('en-CA')

const VACIO = { vehiculo: '', modelo: '', anio: '', vin: '', cliente: '', descripcion: '', prioridad: 'media' as Prioridad, fecha_requerida: '' }

export default function NuevoPedido() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [f, setF] = useState(VACIO)
  const [piezas, setPiezas] = useState<PiezaEditable[]>([])
  const [archivos, setArchivos] = useState<File[]>([])
  const [etiquetas, setEtiquetas] = useState<number[]>([])
  const [creado, setCreado] = useState<PedidoDetalle | null>(null)
  const [intentoEnviar, setIntentoEnviar] = useState(false)
  const { data: datosTablero } = useQuery({ queryKey: ['tablero'], queryFn: tablero.ver, staleTime: 60000 })

  const vinLimpio = f.vin.replace(/\s/g, '').toUpperCase()
  const vinValido = !vinLimpio || PATRON_VIN.test(vinLimpio)
  const anioValido = !f.anio || (Number(f.anio) >= 1950 && Number(f.anio) <= ANIO_MAX)
  const piezasValidas = piezas.filter((p) => p.nombre.trim())
  const listo = Boolean(f.vehiculo.trim()) && piezasValidas.length > 0 && vinValido && anioValido

  const crear = useMutation({
    mutationFn: async () => {
      const pedido = await pedidos.crear({
        vehiculo: f.vehiculo,
        modelo: f.modelo || null,
        anio: f.anio ? Number(f.anio) : null,
        vin: vinLimpio || null,
        cliente: f.cliente || null,
        descripcion: f.descripcion || null,
        prioridad: f.prioridad,
        fecha_requerida: f.fecha_requerida || null,
        piezas: piezasValidas.map(({ nombre, cantidad, observacion }) => ({ nombre: nombre.trim(), cantidad, observacion: observacion?.trim() || null })),
        etiquetas,
      })
      if (archivos.length) {
        try {
          await adjuntos.subir(pedido.id, archivos)
        } catch (e) {
          // el pedido ya quedo creado: avisamos pero no lo perdemos
          toast.warning(`El pedido se creó, pero los archivos no subieron: ${(e as Error).message}. Súbelos desde el tablero.`)
        }
      }
      return pedido
    },
    onSuccess: (p) => {
      setCreado(p)
      celebrar()
      qc.invalidateQueries({ queryKey: ['tablero'] })
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo crear el pedido'),
  })

  const reiniciar = () => {
    setF(VACIO)
    setPiezas([])
    setArchivos([])
    setEtiquetas([])
    setCreado(null)
    setIntentoEnviar(false)
  }

  const agregarArchivos = (lista: FileList | null) => {
    const nuevos = Array.from(lista ?? [])
    const grandes = nuevos.filter((a) => a.size > MAX_MB * 1024 * 1024)
    if (grandes.length) toast.error(`${grandes.map((a) => a.name).join(', ')} pasa(n) de ${MAX_MB} MB`)
    setArchivos((x) => [...x, ...nuevos.filter((a) => a.size <= MAX_MB * 1024 * 1024)].slice(0, 15))
  }

  const guia = useMemo((): { texto: string; cara: Expresion } => {
    if (crear.isPending) return { texto: 'Enviando al tablero… 🚀', cara: 'pensando' }
    if (!vinValido) return { texto: 'Mmm, ese VIN no me cuadra. Son 17 caracteres y nunca lleva I, O ni Q.', cara: 'sorprendido' }
    if (!anioValido) return { texto: `El año tiene que estar entre 1950 y ${ANIO_MAX}.`, cara: 'sorprendido' }
    if (!f.vehiculo.trim()) return { texto: `¡Hola ${usuario?.nombre.split(' ')[0]}! Empecemos por el vehículo 🚗`, cara: 'feliz' }
    if (vinLimpio.length === 17) {
      if (!piezasValidas.length) return { texto: '¡VIN perfecto! ✨ Ahora dime qué piezas lleva.', cara: 'guiño' }
    }
    if (!piezasValidas.length) return { texto: `Buenísimo, ${f.vehiculo}. ¿Qué piezas lleva?`, cara: 'pensando' }
    if (!archivos.length) return { texto: 'Si tienes fotos o planos, súbelos. Al dibujante le ayudan un montón.', cara: 'feliz' }
    return { texto: '¡Todo listo! Dale a Enviar y le aviso al equipo 🙌', cara: 'celebrando' }
  }, [crear.isPending, vinValido, anioValido, f.vehiculo, vinLimpio, piezasValidas.length, archivos.length, usuario])

  // vista previa: una tarjeta "falsa" armada con lo que va escribiendo
  const vistaPrevia: Tarjeta | null = usuario ? {
    id: 0, codigo: 'PED-…', vehiculo: f.vehiculo || 'Vehículo', modelo: f.modelo || null, anio: f.anio ? Number(f.anio) : null,
    prioridad: f.prioridad, fecha_requerida: f.fecha_requerida || null, columna_id: 0, posicion: 0,
    creado_por: usuario, miembros: [], etiquetas: datosTablero?.etiquetas.filter((e) => etiquetas.includes(e.id)) ?? [],
    total_piezas: piezasValidas.reduce((s, p) => s + p.cantidad, 0), checklist_hechos: 0, checklist_total: 0,
    total_mensajes: 0, total_adjuntos: archivos.length, portada_url: null, completado_en: null, creado_en: new Date().toISOString(), version: 1,
  } : null

  const primeraImagen = archivos.find((a) => a.type.startsWith('image/'))
  const portada = useUrlObjeto(primeraImagen)
  if (vistaPrevia && portada) vistaPrevia.portada_url = portada

  if (creado) return <Exito pedido={creado} alOtro={reiniciar} />

  const campo = (clave: keyof typeof VACIO) => ({
    value: f[clave],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [clave]: e.target.value }),
  })

  return (
    <div className="nuevo">
      <TituloBarra><h1 className="titulo-pagina">Nuevo pedido</h1></TituloBarra>

      <form
        className="nuevo__formulario"
        onSubmit={(e) => {
          e.preventDefault()
          setIntentoEnviar(true)
          if (listo) crear.mutate()
        }}
      >
        <Bloque numero={1} icono={<CarFront size={18} />} titulo="El vehículo" completo={Boolean(f.vehiculo.trim()) && vinValido && anioValido}>
          <div className="nuevo__rejilla">
            <div className="campo nuevo__ancho">
              <label htmlFor="vehiculo">Vehículo *</label>
              <input id="vehiculo" className="entrada entrada--grande" placeholder="Ej: Toyota Hilux" autoFocus maxLength={120} aria-invalid={intentoEnviar && !f.vehiculo.trim()} {...campo('vehiculo')} />
              {intentoEnviar && !f.vehiculo.trim() && <span className="error-campo">Falta el vehículo</span>}
            </div>
            <div className="campo">
              <label htmlFor="modelo">Modelo / versión</label>
              <input id="modelo" className="entrada" placeholder="Ej: SRV 4x4" maxLength={120} {...campo('modelo')} />
            </div>
            <div className="campo">
              <label htmlFor="anio">Año</label>
              <input id="anio" className="entrada" type="number" inputMode="numeric" placeholder={String(new Date().getFullYear())} min={1950} max={ANIO_MAX} aria-invalid={!anioValido} {...campo('anio')} />
            </div>
            <div className="campo nuevo__ancho">
              <label htmlFor="vin">VIN <span className="sutil">(opcional)</span></label>
              <div className={`nuevo__vin ${vinLimpio.length === 17 && vinValido ? 'ok' : ''} ${!vinValido ? 'mal' : ''}`}>
                <input id="vin" className="entrada mono" maxLength={20} placeholder="17 caracteres" aria-invalid={!vinValido} value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value.toUpperCase() })} />
                <span className="nuevo__vin-cuenta">{vinLimpio.length}/17</span>
              </div>
              <div className="nuevo__vin-cajas" aria-hidden="true">
                {Array.from({ length: 17 }, (_, i) => <span key={i} className={i < vinLimpio.length ? 'lleno' : ''}>{vinLimpio[i] ?? ''}</span>)}
              </div>
            </div>
            <div className="campo nuevo__ancho">
              <label htmlFor="cliente">Cliente <span className="sutil">(opcional)</span></label>
              <input id="cliente" className="entrada" placeholder="¿Para quién es?" maxLength={150} {...campo('cliente')} />
            </div>
          </div>
        </Bloque>

        <Bloque numero={2} icono={<Puzzle size={18} />} titulo="Las piezas" completo={piezasValidas.length > 0}>
          <EditorPiezas piezas={piezas} onChange={setPiezas} />
          {intentoEnviar && !piezasValidas.length && <span className="error-campo">Agrega mínimo una pieza</span>}
        </Bloque>

        <Bloque numero={3} icono={<ImagePlus size={18} />} titulo="Detalles y archivos" completo={archivos.length > 0 || Boolean(f.descripcion)} opcional>
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
          <div className="nuevo__rejilla">
            <div className="campo">
              <label htmlFor="fecha">¿Para cuándo se necesita?</label>
              <input id="fecha" className="entrada" type="date" min={hoyLocal()} {...campo('fecha_requerida')} />
            </div>
            {datosTablero && datosTablero.etiquetas.length > 0 && (
              <div className="campo">
                <label>Etiquetas</label>
                <div className="detalles__etiquetas">
                  {datosTablero.etiquetas.map((e) => {
                    const activa = etiquetas.includes(e.id)
                    return (
                      <button type="button" key={e.id} className="chip" style={activa ? { background: `${e.color}44`, borderColor: e.color } : undefined}
                        onClick={() => setEtiquetas((s) => (activa ? s.filter((x) => x !== e.id) : [...s, e.id]))}>
                        <span className="punto" style={{ background: e.color }} />{e.nombre}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="campo">
            <label htmlFor="descripcion">Comentarios para el equipo</label>
            <textarea id="descripcion" className="entrada" placeholder="Algo que el dibujante o el técnico deba saber…" maxLength={4000} {...campo('descripcion')} />
          </div>

          <label
            className="archivos__zona"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); agregarArchivos(e.dataTransfer.files) }}
          >
            <input type="file" multiple hidden onChange={(e) => { agregarArchivos(e.target.files); e.target.value = '' }} />
            <ImagePlus size={28} />
            <strong>Fotos, planos o documentos</strong>
            <span>Arrastra aquí o haz clic · hasta {MAX_MB} MB cada uno</span>
          </label>
          {archivos.length > 0 && (
            <ul className="nuevo__archivos">
              {archivos.map((a, i) => <ArchivoPrevio key={`${a.name}-${i}`} archivo={a} alQuitar={() => setArchivos((x) => x.filter((_, j) => j !== i))} />)}
            </ul>
          )}
        </Bloque>

        <div className="nuevo__enviar">
          <button className="btn btn-primario btn-grande" disabled={crear.isPending}>
            {crear.isPending ? 'Enviando…' : <>Enviar pedido <Send size={18} /></>}
          </button>
        </div>
      </form>

      <aside className="nuevo__lateral">
        <div className="nuevo__guia">
          <AnimatePresence mode="wait">
            <motion.div key={guia.texto} className="nuevo__globo vidrio" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }}>
              {guia.texto}
            </motion.div>
          </AnimatePresence>
          <Personaje personaje="vendedora" expresion={guia.cara} tamano={120} />
        </div>
        <p className="etiqueta-campo">Así se va a ver en el tablero</p>
        {vistaPrevia && <TarjetaPedido tarjeta={vistaPrevia} />}
        <ol className="nuevo__pasos">
          <li className={f.vehiculo.trim() ? 'ok' : ''}>Vehículo</li>
          <li className={piezasValidas.length ? 'ok' : ''}>Piezas ({piezasValidas.length})</li>
          <li className={archivos.length ? 'ok' : ''}>Archivos ({archivos.length})</li>
        </ol>
      </aside>
    </div>
  )
}

function Bloque({ numero, icono, titulo, completo, opcional, children }: { numero: number; icono: React.ReactNode; titulo: string; completo: boolean; opcional?: boolean; children: React.ReactNode }) {
  return (
    <motion.section className={`nuevo__bloque vidrio ${completo ? 'completo' : ''}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: numero * 0.07 }}>
      <header>
        <span className="nuevo__numero">{completo ? '✓' : numero}</span>
        <span className="nuevo__icono">{icono}</span>
        <h2>{titulo}</h2>
        {opcional && <span className="chip">Opcional</span>}
      </header>
      {children}
    </motion.section>
  )
}

function useUrlObjeto(archivo?: File) {
  // URL temporal para previsualizar un archivo local; hay que liberarla al terminar
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!archivo) return setUrl(null)
    const u = URL.createObjectURL(archivo)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [archivo])
  return url
}

function ArchivoPrevio({ archivo, alQuitar }: { archivo: File; alQuitar: () => void }) {
  const esImagen = archivo.type.startsWith('image/')
  const url = useUrlObjeto(esImagen ? archivo : undefined)
  return (
    <motion.li layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
      {url ? <img src={url} alt="" /> : <span className="nuevo__archivo-icono"><FileText size={22} /></span>}
      <div>
        <strong>{archivo.name}</strong>
        <span>{tamanoArchivo(archivo.size)}</span>
      </div>
      <button type="button" onClick={alQuitar} aria-label="Quitar"><X size={14} /></button>
    </motion.li>
  )
}

function Exito({ pedido, alOtro }: { pedido: PedidoDetalle; alOtro: () => void }) {
  return (
    <div className="nuevo__exito">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        <Personaje personaje="vendedora" expresion="celebrando" tamano={180} />
      </motion.div>
      <motion.div className="nuevo__exito-texto" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <span className="chip mono">{pedido.codigo}</span>
        <h1 className="titulo-pagina">¡Pedido enviado!</h1>
        <p>
          <b>{pedido.vehiculo} {pedido.modelo}</b> ya está en el tablero con {pedido.total_piezas} pieza(s).
          <br />Le avisé al equipo de dibujo y técnica. 📬
        </p>
        <div className="nuevo__exito-botones">
          <button className="btn btn-grande" onClick={alOtro}><RotateCcw size={18} /> Crear otro</button>
          <Link className="btn btn-primario btn-grande" to={`/mis-pedidos`}>Ver mis pedidos <ArrowRight size={18} /></Link>
          <Link className="btn btn-grande" to={`/tablero?pedido=${pedido.id}`}><KanbanSquare size={18} /> Abrir en tablero</Link>
        </div>
      </motion.div>
    </div>
  )
}

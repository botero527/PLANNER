// El formulario del comercial: sencillo, en 4 bloques, con Vendi guiando y
// una vista previa en vivo de como va a quedar la tarjeta en el tablero.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Box, CarFront, CloudCheck, CloudOff, FileText, Gem, ImagePlus, KanbanSquare, Layers, Puzzle, RotateCcw, Send, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { adjuntos, pedidos, tablero } from '@/api/endpoints'
import type { PedidoDetalle, Tarjeta, TipoVidrio } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { EditorPiezas, type PiezaEditable } from '@/componentes/EditorPiezas'
import { Personaje, type Expresion } from '@/componentes/personajes/Personaje'
import { TituloBarra } from '@/componentes/TituloBarra'
import { celebrar } from '@/utiles/confeti'
import { tamanoArchivo } from '@/utiles/formato'
import { TarjetaPedido } from './tablero/TarjetaPedido'
import './nuevo-pedido.css'

const ANIO_MAX = new Date().getFullYear() + 2
const MAX_MB = 25

const VACIO = {
  marca: '', modelo: '', version_vehiculo: '', plataforma: '', anio: '', vin: '', mercado: '',
  tipo_vidrio: 'original' as TipoVidrio, info_en_drive: null as boolean | null, descripcion: '',
}
type Formulario = typeof VACIO

export default function NuevoPedido() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [f, setF] = useState<Formulario>(VACIO)
  const [piezas, setPiezas] = useState<PiezaEditable[]>([])
  const [archivos, setArchivos] = useState<File[]>([])
  const [etiquetas, setEtiquetas] = useState<number[]>([])
  const [creado, setCreado] = useState<PedidoDetalle | null>(null)
  const [intentoEnviar, setIntentoEnviar] = useState(false)
  const { data: datosTablero } = useQuery({ queryKey: ['tablero'], queryFn: tablero.ver, staleTime: 60000 })
  // el catalogo casi nunca cambia: se pide una vez y se guarda 10 minutos
  const { data: catalogos } = useQuery({ queryKey: ['catalogos'], queryFn: tablero.catalogos, staleTime: 600000 })

  const anioValido = !f.anio || (Number(f.anio) >= 1950 && Number(f.anio) <= ANIO_MAX)
  const faltaDrive = f.tipo_vidrio === '3d' && f.info_en_drive === null
  const faltan = {
    marca: !f.marca.trim(),
    modelo: !f.modelo.trim(),
    vin: !f.vin.trim(),
    mercado: !f.mercado,
    piezas: piezas.length === 0,
    drive: faltaDrive,
  }
  const listo = !Object.values(faltan).some(Boolean) && anioValido
  const vehiculoCompleto = !faltan.marca && !faltan.modelo && !faltan.vin && !faltan.mercado && anioValido

  const crear = useMutation({
    mutationFn: async () => {
      const pedido = await pedidos.crear({
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
        piezas: piezas.map(({ codigo, nombre, observacion }) => ({ codigo: codigo ?? null, nombre, observacion: observacion?.trim() || null })),
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
    if (!anioValido) return { texto: `El año tiene que estar entre 1950 y ${ANIO_MAX}.`, cara: 'sorprendido' }
    if (faltan.marca) return { texto: `¡Hola ${usuario?.nombre.split(' ')[0]}! Empecemos por la marca del vehículo 🚗`, cara: 'feliz' }
    if (faltan.modelo) return { texto: `${f.marca}, buenísimo. ¿Qué modelo?`, cara: 'pensando' }
    if (faltan.vin) return { texto: 'Me falta el VIN. Pégalo como venga, sin importar el largo.', cara: 'pensando' }
    if (faltan.mercado) return { texto: '¿Para qué mercado es? México, LATAM, Europa…', cara: 'pensando' }
    if (faltaDrive) return { texto: 'Es 3D: cuéntame si la información ya está en Drive.', cara: 'sorprendido' }
    if (faltan.piezas) return { texto: 'Ahora las piezas. Escribe el código (000, 001…) y yo le pongo el nombre.', cara: 'guiño' }
    if (!archivos.length) return { texto: 'Si tienes fotos o planos, súbelos. Al dibujante le ayudan un montón.', cara: 'feliz' }
    return { texto: '¡Todo listo! Dale a Enviar y le aviso al equipo 🙌', cara: 'celebrando' }
  }, [crear.isPending, anioValido, faltan.marca, faltan.modelo, faltan.vin, faltan.mercado, faltaDrive, faltan.piezas, f.marca, archivos.length, usuario])

  // vista previa: una tarjeta "falsa" armada con lo que va escribiendo
  const vistaPrevia: Tarjeta | null = usuario ? {
    id: 0, codigo: 'PED-…', marca: f.marca || 'Marca', modelo: f.modelo || 'Modelo', version_vehiculo: f.version_vehiculo || null,
    anio: f.anio ? Number(f.anio) : null, mercado: f.mercado || '—', tipo_vidrio: f.tipo_vidrio,
    prioridad: 'media', fecha_requerida: null, columna_id: 0, posicion: 0,
    creado_por: usuario, miembros: [], etiquetas: datosTablero?.etiquetas.filter((e) => etiquetas.includes(e.id)) ?? [],
    total_piezas: piezas.length, checklist_hechos: 0, checklist_total: 0,
    total_mensajes: 0, total_adjuntos: archivos.length, portada_url: null, completado_en: null, creado_en: new Date().toISOString(), version: 1,
  } : null

  const primeraImagen = archivos.find((a) => a.type.startsWith('image/'))
  const portada = useUrlObjeto(primeraImagen)
  if (vistaPrevia && portada) vistaPrevia.portada_url = portada

  if (creado) return <Exito pedido={creado} alOtro={reiniciar} />

  const campo = (clave: keyof Formulario) => ({
    value: String(f[clave] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [clave]: e.target.value }),
  })
  const falta = (clave: keyof typeof faltan) => intentoEnviar && faltan[clave]

  return (
    <div className="nuevo">
      <TituloBarra><h1 className="titulo-pagina">Nuevo pedido</h1></TituloBarra>

      <form
        className="nuevo__formulario"
        onSubmit={(e) => {
          e.preventDefault()
          setIntentoEnviar(true)
          if (listo) crear.mutate()
          else toast.error('Faltan datos obligatorios, te los marqué en rojo')
        }}
      >
        <Bloque numero={1} icono={<CarFront size={18} />} titulo="El vehículo" completo={vehiculoCompleto}>
          <div className="nuevo__rejilla">
            <div className="campo">
              <label htmlFor="marca">Marca *</label>
              <input id="marca" className="entrada entrada--grande" placeholder="Ej: Toyota" autoFocus maxLength={80} aria-invalid={falta('marca')} {...campo('marca')} />
              {falta('marca') && <span className="error-campo">Falta la marca</span>}
            </div>
            <div className="campo">
              <label htmlFor="modelo">Modelo *</label>
              <input id="modelo" className="entrada entrada--grande" placeholder="Ej: Hilux" maxLength={120} aria-invalid={falta('modelo')} {...campo('modelo')} />
              {falta('modelo') && <span className="error-campo">Falta el modelo</span>}
            </div>
            <div className="campo">
              <label htmlFor="version">Versión <span className="sutil">(opcional)</span></label>
              <input id="version" className="entrada" placeholder="Ej: SRV 4x4" maxLength={120} {...campo('version_vehiculo')} />
            </div>
            <div className="campo">
              <label htmlFor="plataforma">Plataforma o código de modelo <span className="sutil">(opcional)</span></label>
              <input id="plataforma" className="entrada mono" placeholder="Ej: AN120, TNGA-F" maxLength={80} {...campo('plataforma')} />
            </div>
            <div className="campo">
              <label htmlFor="anio">Año <span className="sutil">(opcional)</span></label>
              <input id="anio" className="entrada" type="number" inputMode="numeric" placeholder={String(new Date().getFullYear())} min={1950} max={ANIO_MAX} aria-invalid={!anioValido} {...campo('anio')} />
            </div>
            <div className="campo">
              <label htmlFor="mercado">Mercado *</label>
              <select id="mercado" className="entrada" aria-invalid={falta('mercado')} {...campo('mercado')}>
                <option value="" disabled>Escoge el mercado…</option>
                {(catalogos?.mercados ?? []).map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {falta('mercado') && <span className="error-campo">Escoge el mercado</span>}
            </div>
            <div className="campo nuevo__ancho">
              <label htmlFor="vin">VIN *</label>
              {/* libre: sin limite ni formato, pueden pegar varios o traer notas */}
              <textarea id="vin" className="entrada mono nuevo__vin-libre" rows={1} placeholder="Pega el VIN tal cual (puede ser largo o traer varios)" aria-invalid={falta('vin')} {...campo('vin')} />
              <span className="ayuda-campo">{f.vin.length ? `${f.vin.length} caracteres` : 'Sin límite de caracteres'}</span>
              {falta('vin') && <span className="error-campo">El VIN es obligatorio</span>}
            </div>
          </div>
        </Bloque>

        <Bloque numero={2} icono={<Layers size={18} />} titulo="El vidrio" completo={!faltaDrive}>
          <div className="nuevo__opciones" role="radiogroup" aria-label="Tipo de vidrio">
            <Opcion activa={f.tipo_vidrio === 'original'} onClick={() => setF({ ...f, tipo_vidrio: 'original', info_en_drive: null })}
              icono={<Gem size={22} />} titulo="Vidrio original" texto="Se trabaja con la pieza original del vehículo" />
            <Opcion activa={f.tipo_vidrio === '3d'} onClick={() => setF({ ...f, tipo_vidrio: '3d' })}
              icono={<Box size={22} />} titulo="3D" texto="Se trabaja con un modelo 3D" />
          </div>
          <AnimatePresence>
            {f.tipo_vidrio === '3d' && (
              <motion.div className="campo" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <label>¿Ya está la información en Drive? *</label>
                <div className="nuevo__opciones nuevo__opciones--chicas" role="radiogroup">
                  <Opcion activa={f.info_en_drive === true} onClick={() => setF({ ...f, info_en_drive: true })} icono={<CloudCheck size={20} />} titulo="Sí, ya está" />
                  <Opcion activa={f.info_en_drive === false} onClick={() => setF({ ...f, info_en_drive: false })} icono={<CloudOff size={20} />} titulo="Todavía no" />
                </div>
                {falta('drive') && <span className="error-campo">Cuéntanos si la información ya está en Drive</span>}
              </motion.div>
            )}
          </AnimatePresence>
        </Bloque>

        <Bloque numero={3} icono={<Puzzle size={18} />} titulo="Las piezas" completo={piezas.length > 0}>
          <EditorPiezas piezas={piezas} onChange={setPiezas} catalogo={catalogos?.piezas ?? []} />
          {falta('piezas') && <span className="error-campo">Agrega mínimo una pieza</span>}
        </Bloque>

        <Bloque numero={4} icono={<ImagePlus size={18} />} titulo="Comentarios y archivos" completo={archivos.length > 0 || Boolean(f.descripcion)} opcional>
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
          <li className={vehiculoCompleto ? 'ok' : ''}>Vehículo</li>
          <li className={!faltaDrive ? 'ok' : ''}>Vidrio ({f.tipo_vidrio === '3d' ? '3D' : 'original'})</li>
          <li className={piezas.length ? 'ok' : ''}>Piezas ({piezas.length})</li>
          <li className={archivos.length ? 'ok' : ''}>Archivos ({archivos.length})</li>
        </ol>
      </aside>
    </div>
  )
}

function Opcion({ activa, onClick, icono, titulo, texto }: { activa: boolean; onClick: () => void; icono: React.ReactNode; titulo: string; texto?: string }) {
  return (
    <button type="button" role="radio" aria-checked={activa} className={`nuevo__opcion ${activa ? 'activa' : ''}`} onClick={onClick}>
      <span className="nuevo__opcion-icono">{icono}</span>
      <span className="nuevo__opcion-textos">
        <strong>{titulo}</strong>
        {texto && <span>{texto}</span>}
      </span>
    </button>
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
          <b>{pedido.marca} {pedido.modelo}</b> ya está en el tablero con {pedido.total_piezas} pieza(s).
          <br />Le avisé al equipo de dibujo y técnica. 📬
        </p>
        <div className="nuevo__exito-botones">
          <button className="btn btn-grande" onClick={alOtro}><RotateCcw size={18} /> Crear otro</button>
          <Link className="btn btn-primario btn-grande" to="/mis-pedidos">Ver mis pedidos <ArrowRight size={18} /></Link>
          <Link className="btn btn-grande" to={`/tablero?pedido=${pedido.id}`}><KanbanSquare size={18} /> Abrir en tablero</Link>
        </div>
      </motion.div>
    </div>
  )
}

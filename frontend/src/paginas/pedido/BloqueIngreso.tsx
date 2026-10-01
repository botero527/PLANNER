// Ingreso del pedido (primera columna): 1) tecnica crea el codigo del vehiculo con
// evidencia, 2) el comercial pone el numero de pedido, 3) tecnica aprueba y el pedido
// pasa solo a la segunda columna. Cada persona ve solo el boton que le toca.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Check, ClipboardCheck, FileText, Hash, PartyPopper, Undo2, UploadCloud, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { refrescarPronto } from '@/api/cacheLocal'
import { ErrorApi } from '@/api/cliente'
import { ingreso } from '@/api/endpoints'
import type { Columna, PedidoDetalle } from '@/api/tipos'
import { VisorArchivo } from '@/componentes/VisorArchivo'
import { celebrar } from '@/utiles/confeti'
import { haceCuanto, primerNombre, tamanoArchivo } from '@/utiles/formato'
import './ingreso.css'

type Estado = 'hecho' | 'actual' | 'pendiente'

export function BloqueIngreso({ pedido, columnas }: { pedido: PedidoDetalle; columnas: Columna[] }) {
  const qc = useQueryClient()
  const [viendo, setViendo] = useState<number | null>(null)
  const ordenadas = [...columnas].sort((a, b) => a.orden - b.orden)
  const siguiente = ordenadas.find((c) => c.orden > (ordenadas.find((x) => x.es_inicial) ?? ordenadas[0])?.orden)

  const alListo = (p: PedidoDetalle) => {
    qc.setQueryData(['pedido', p.id], p)
    refrescarPronto(qc, ['tablero'], 200)
    qc.invalidateQueries({ queryKey: ['adjuntos', p.id] })
  }
  const error = (e: unknown) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar')

  const paso1: Estado = pedido.codigo_vehiculo_en ? 'hecho' : 'actual'
  const paso2: Estado = pedido.numero_pedido ? 'hecho' : paso1 === 'hecho' ? 'actual' : 'pendiente'
  const paso3: Estado = pedido.aprobado_en ? 'hecho' : paso2 === 'hecho' ? 'actual' : 'pendiente'

  // ya aprobado: solo el resumen
  if (pedido.aprobado_en) {
    return (
      <section className="ingreso ingreso--cerrado vidrio">
        <span className="ingreso__sello"><ClipboardCheck size={18} /></span>
        <div>
          <strong>Ingreso aprobado</strong>
          <p>
            Código {pedido.codigo_vehiculo ? <b className="mono">{pedido.codigo_vehiculo}</b> : 'creado'} · pedido <b className="mono">{pedido.numero_pedido}</b>
            {pedido.aprobado_por && <> · aprobó {pedido.aprobado_por.nombre} {haceCuanto(pedido.aprobado_en)}</>}
          </p>
        </div>
        {pedido.evidencias.length > 0 && (
          <button className="btn btn-chico" onClick={() => setViendo(0)}><FileText size={14} /> Evidencia ({pedido.evidencias.length})</button>
        )}
        <VisorArchivo archivos={pedido.evidencias} indice={viendo} alCambiar={setViendo} />
      </section>
    )
  }
  if (!pedido.en_ingreso) return null

  return (
    <section className="ingreso vidrio">
      <header className="ingreso__cabeza">
        <h3>Ingreso del pedido</h3>
        <span className="sutil">Para pasar a {siguiente?.nombre ?? 'la siguiente columna'} faltan estos pasos</span>
      </header>

      <ol className="ingreso__pasos">
        <Paso numero={1} estado={paso1} titulo="Código del vehículo" quien="Técnica">
          {paso1 === 'hecho' ? (
            <>
              <p className="ingreso__hecho">
                {pedido.codigo_vehiculo ? <b className="mono">{pedido.codigo_vehiculo}</b> : 'Creado'} · {pedido.codigo_vehiculo_por?.nombre} · {haceCuanto(pedido.codigo_vehiculo_en!)}
              </p>
              <div className="ingreso__evidencias">
                {pedido.evidencias.map((a, i) => (
                  <button key={a.id} className="ingreso__evidencia" onClick={() => setViendo(i)} title={a.nombre}>
                    {a.es_imagen ? <img src={a.url} alt={a.nombre} /> : <FileText size={22} />}
                  </button>
                ))}
              </div>
              {pedido.puedo_gestionar_ingreso && !pedido.numero_pedido && <Deshacer pedidoId={pedido.id} alListo={alListo} />}
            </>
          ) : pedido.puedo_gestionar_ingreso ? (
            <MarcarCodigo pedidoId={pedido.id} alListo={alListo} onError={error} />
          ) : (
            <p className="sutil">Esperando que técnica cree el código del vehículo.</p>
          )}
        </Paso>

        <Paso numero={2} estado={paso2} titulo="Número de pedido" quien="Comercial">
          {paso2 === 'pendiente' ? (
            <p className="sutil">Se habilita cuando esté el código del vehículo.</p>
          ) : paso2 === 'hecho' ? (
            <NumeroPedido pedido={pedido} alListo={alListo} onError={error} />
          ) : pedido.puedo_poner_pedido ? (
            <NumeroPedido pedido={pedido} alListo={alListo} onError={error} />
          ) : (
            <p className="sutil">Esperando que {primerNombre(pedido.creado_por.nombre)} ponga el número de pedido.</p>
          )}
        </Paso>

        <Paso numero={3} estado={paso3} titulo="Aprobación" quien="Técnica">
          {paso3 === 'pendiente' ? (
            <p className="sutil">Se habilita cuando el comercial ponga el número de pedido.</p>
          ) : pedido.puedo_gestionar_ingreso ? (
            <Aprobar pedidoId={pedido.id} destino={siguiente?.nombre} alListo={alListo} onError={error} />
          ) : (
            <p className="sutil">Esperando que técnica revise y apruebe.</p>
          )}
        </Paso>
      </ol>
      <VisorArchivo archivos={pedido.evidencias} indice={viendo} alCambiar={setViendo} />
    </section>
  )
}

function Paso({ numero, estado, titulo, quien, children }: { numero: number; estado: Estado; titulo: string; quien: string; children: React.ReactNode }) {
  return (
    <li className={`ingreso__paso ${estado}`}>
      <span className="ingreso__bolita">{estado === 'hecho' ? <Check size={15} /> : numero}</span>
      <div className="ingreso__cuerpo">
        <div className="ingreso__titulo"><strong>{titulo}</strong><span className="chip">{quien}</span></div>
        {children}
      </div>
    </li>
  )
}

function MarcarCodigo({ pedidoId, alListo, onError }: { pedidoId: number; alListo: (p: PedidoDetalle) => void; onError: (e: unknown) => void }) {
  const [codigo, setCodigo] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [encima, setEncima] = useState(false)
  const marcar = useMutation({
    mutationFn: () => ingreso.marcarCodigo(pedidoId, archivos, codigo),
    onSuccess: (p) => { alListo(p); toast.success('Código marcado. Le avisé al comercial 📬') },
    onError,
  })
  // Ojo: el FileList es "vivo"; si lo leemos dentro del updater, el input ya se vacio
  // (value = '') y llega vacio. Por eso se copia a un array ANTES del setState.
  const agregar = (l: FileList | null) => {
    const nuevos = Array.from(l ?? [])
    setArchivos((x) => [...x, ...nuevos].slice(0, 15))
  }

  return (
    <div className="ingreso__form">
      <input className="entrada mono" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código creado (opcional), ej: TOY-HLX-25" maxLength={80} />
      <label
        className={`archivos__zona ingreso__zona ${encima ? 'encima' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setEncima(true) }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => { e.preventDefault(); setEncima(false); agregar(e.dataTransfer.files) }}
      >
        <input type="file" multiple hidden onChange={(e) => { agregar(e.target.files); e.target.value = '' }} />
        <UploadCloud size={22} />
        <strong>Evidencia (obligatoria)</strong>
        <span>Pantallazo o archivo que muestre el código creado</span>
      </label>
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
      <button className="btn btn-primario" disabled={!archivos.length || marcar.isPending} onClick={() => marcar.mutate()}>
        <Check size={16} /> {marcar.isPending ? 'Subiendo evidencia…' : 'Marcar código como creado'}
      </button>
    </div>
  )
}

function Deshacer({ pedidoId, alListo }: { pedidoId: number; alListo: (p: PedidoDetalle) => void }) {
  const deshacer = useMutation({
    mutationFn: () => ingreso.deshacerCodigo(pedidoId),
    onSuccess: (p) => { alListo(p); toast('Marca del código deshecha') },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo deshacer'),
  })
  return (
    <button className="btn btn-fantasma btn-chico ingreso__deshacer" disabled={deshacer.isPending}
      onClick={() => window.confirm('¿Deshacer la marca del código? La evidencia se quita.') && deshacer.mutate()}>
      <Undo2 size={13} /> Deshacer
    </button>
  )
}

function NumeroPedido({ pedido, alListo, onError }: { pedido: PedidoDetalle; alListo: (p: PedidoDetalle) => void; onError: (e: unknown) => void }) {
  const [editando, setEditando] = useState(!pedido.numero_pedido)
  const [numero, setNumero] = useState(pedido.numero_pedido ?? '')
  const guardar = useMutation({
    mutationFn: () => ingreso.ponerNumero(pedido.id, numero),
    onSuccess: (p) => { alListo(p); setEditando(false); toast.success('Número guardado. Técnica ya puede aprobar 📬') },
    onError,
  })

  if (!editando) {
    return (
      <div className="ingreso__numero">
        <span className="ingreso__numero-valor mono"><Hash size={15} />{pedido.numero_pedido}</span>
        <span className="sutil">{pedido.numero_pedido_por?.nombre} · {pedido.numero_pedido_en && haceCuanto(pedido.numero_pedido_en)}</span>
        {pedido.puedo_poner_pedido && <button className="btn btn-fantasma btn-chico" onClick={() => setEditando(true)}>Corregir</button>}
      </div>
    )
  }
  return (
    <form className="ingreso__fila" onSubmit={(e) => { e.preventDefault(); if (numero.trim()) guardar.mutate() }}>
      <input className="entrada mono" autoFocus value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Número de pedido" maxLength={60} />
      <button className="btn btn-primario" disabled={!numero.trim() || guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      {pedido.numero_pedido && <button type="button" className="btn" onClick={() => { setEditando(false); setNumero(pedido.numero_pedido ?? '') }}>Cancelar</button>}
    </form>
  )
}

function Aprobar({ pedidoId, destino, alListo, onError }: { pedidoId: number; destino?: string; alListo: (p: PedidoDetalle) => void; onError: (e: unknown) => void }) {
  const aprobar = useMutation({
    mutationFn: () => ingreso.aprobar(pedidoId),
    onSuccess: (p) => { alListo(p); celebrar(); toast.success(`¡Aprobado! El pedido pasó a ${destino ?? 'la siguiente columna'} 🎉`) },
    onError,
  })
  return (
    <motion.button className="btn btn-primario btn-grande ingreso__aprobar" whileTap={{ scale: 0.97 }} disabled={aprobar.isPending}
      onClick={() => window.confirm(`¿La información está completa? El pedido pasa a ${destino ?? 'la siguiente columna'} y el comercial ya no podrá editarlo.`) && aprobar.mutate()}>
      <PartyPopper size={18} /> {aprobar.isPending ? 'Aprobando…' : `Aprobado · pasar a ${destino ?? 'siguiente columna'}`}
    </motion.button>
  )
}

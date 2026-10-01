// Visor de archivos a pantalla completa: imagenes, PDF, video y texto se ven
// adentro de la app; lo demas (DWG, Excel...) muestra su icono y el boton de descargar.
// Flechas del teclado para pasar entre archivos, Escape para cerrar.
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, Download, FileQuestion, Trash2, X } from 'lucide-react'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Adjunto } from '@/api/tipos'
import { haceCuanto, tamanoArchivo } from '@/utiles/formato'
import './visor.css'

type Tipo = 'imagen' | 'pdf' | 'video' | 'texto' | 'otro'

export function tipoDeVista(a: Pick<Adjunto, 'tipo_mime' | 'nombre'>): Tipo {
  const ext = a.nombre.split('.').pop()?.toLowerCase() ?? ''
  if (a.tipo_mime.startsWith('image/')) return 'imagen'
  if (a.tipo_mime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (a.tipo_mime.startsWith('video/')) return 'video'
  if (a.tipo_mime === 'text/plain' || ext === 'txt') return 'texto'
  return 'otro'
}

/** true si el archivo se puede ver adentro de la app (no solo descargar) */
export const sePuedeVer = (a: Pick<Adjunto, 'tipo_mime' | 'nombre'>) => tipoDeVista(a) !== 'otro'

interface Props {
  archivos: Adjunto[]
  indice: number | null
  alCambiar: (indice: number | null) => void
  alQuitar?: (a: Adjunto) => void
  puedeQuitar?: (a: Adjunto) => boolean
}

export function VisorArchivo({ archivos, indice, alCambiar, alQuitar, puedeQuitar }: Props) {
  const actual = indice !== null ? archivos[indice] : null
  const total = archivos.length

  useEffect(() => {
    if (indice === null) return
    const tecla = (e: KeyboardEvent) => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return
      // en fase de captura y cortando la propagacion: asi el Escape cierra el
      // visor y NO le llega al panel del pedido (que tambien escucha Escape)
      e.stopImmediatePropagation()
      e.preventDefault()
      if (e.key === 'Escape') alCambiar(null)
      if (e.key === 'ArrowLeft' && total > 1) alCambiar((indice - 1 + total) % total)
      if (e.key === 'ArrowRight' && total > 1) alCambiar((indice + 1) % total)
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [indice, total, alCambiar])

  return createPortal(
    <AnimatePresence>
      {actual && indice !== null && (
        <motion.div className="visor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => alCambiar(null)}>
          <header className="visor__barra" onClick={(e) => e.stopPropagation()}>
            <div className="visor__info">
              <strong>{actual.nombre}</strong>
              <span>{tamanoArchivo(actual.tamano_bytes)} · {actual.subido_por.nombre} · {haceCuanto(actual.creado_en)}{total > 1 && ` · ${indice + 1} de ${total}`}</span>
            </div>
            <a className="btn btn-chico" href={actual.url_descarga}><Download size={14} /> Descargar</a>
            {alQuitar && puedeQuitar?.(actual) && (
              <button className="btn btn-chico btn-peligro" onClick={() => { alQuitar(actual); alCambiar(null) }}><Trash2 size={14} /> Quitar</button>
            )}
            <button className="btn btn-chico btn-icono" onClick={() => alCambiar(null)} aria-label="Cerrar"><X size={16} /></button>
          </header>

          <div className="visor__contenido" onClick={(e) => e.stopPropagation()}>
            <motion.div key={actual.id} className="visor__marco" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18 }}>
              <Contenido archivo={actual} />
            </motion.div>
          </div>

          {total > 1 && (
            <>
              <button className="visor__flecha visor__flecha--izq" onClick={(e) => { e.stopPropagation(); alCambiar((indice - 1 + total) % total) }} aria-label="Anterior"><ChevronLeft size={26} /></button>
              <button className="visor__flecha visor__flecha--der" onClick={(e) => { e.stopPropagation(); alCambiar((indice + 1) % total) }} aria-label="Siguiente"><ChevronRight size={26} /></button>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Contenido({ archivo: a }: { archivo: Adjunto }) {
  switch (tipoDeVista(a)) {
    case 'imagen':
      return <img src={a.url} alt={a.nombre} className="visor__imagen" />
    case 'pdf':
    case 'texto':
      // el navegador trae su propio lector de PDF: zoom, paginas, buscar...
      return <iframe src={a.url} title={a.nombre} className="visor__documento" />
    case 'video':
      return <video src={a.url} controls autoPlay className="visor__imagen" />
    default:
      return (
        <div className="visor__sin-vista">
          <FileQuestion size={56} />
          <strong>Este tipo de archivo no se puede ver en el navegador</strong>
          <span>Los planos DWG/DXF, Excel o ZIP se abren con su programa. Descárgalo para verlo.</span>
          <a className="btn btn-primario" href={a.url_descarga}><Download size={16} /> Descargar {a.nombre}</a>
        </div>
      )
  }
}

// Lista editable de piezas (nombre + cantidad + nota). Se usa en el formulario
// del comercial y al editar un pedido.
import { AnimatePresence, motion } from 'motion/react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import type { Pieza } from '@/api/tipos'
import './editor-piezas.css'

// Sugerencias para escribir rapido. Por ahora fijas; cuando haya catalogo salen de la base.
export const PIEZAS_COMUNES = [
  'Parabrisas', 'Vidrio puerta delantera izquierda', 'Vidrio puerta delantera derecha',
  'Vidrio puerta trasera izquierda', 'Vidrio puerta trasera derecha', 'Vidrio trasero (panorámico)',
  'Aleta izquierda', 'Aleta derecha', 'Quemacocos / techo', 'Vidrio lateral fijo', 'Mirilla',
]

export type PiezaEditable = Pieza & { clave: string }

let contador = 0
export const nuevaPieza = (nombre = ''): PiezaEditable => ({ clave: `p${++contador}`, nombre, cantidad: 1, observacion: '' })

interface Props {
  piezas: PiezaEditable[]
  onChange: (piezas: PiezaEditable[]) => void
}

export function EditorPiezas({ piezas, onChange }: Props) {
  const [escribiendo, setEscribiendo] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  const agregar = (nombre: string) => {
    const limpio = nombre.trim()
    if (!limpio) return
    // si ya existe la misma pieza, le sumamos cantidad en vez de repetirla
    const existe = piezas.find((p) => p.nombre.toLowerCase() === limpio.toLowerCase())
    if (existe) onChange(piezas.map((p) => (p === existe ? { ...p, cantidad: p.cantidad + 1 } : p)))
    else onChange([...piezas, nuevaPieza(limpio)])
    setEscribiendo('')
    entrada.current?.focus()
  }

  const cambiar = (clave: string, cambio: Partial<Pieza>) =>
    onChange(piezas.map((p) => (p.clave === clave ? { ...p, ...cambio } : p)))

  const sugerencias = PIEZAS_COMUNES.filter((s) => !piezas.some((p) => p.nombre === s)).slice(0, 8)

  return (
    <div className="piezas">
      <div className="piezas__agregar">
        <input
          ref={entrada}
          className="entrada"
          list="piezas-comunes"
          value={escribiendo}
          onChange={(e) => setEscribiendo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              agregar(escribiendo)
            }
          }}
          placeholder="Escribe una pieza y dale Enter…"
          aria-label="Nueva pieza"
        />
        <datalist id="piezas-comunes">
          {PIEZAS_COMUNES.map((p) => <option key={p} value={p} />)}
        </datalist>
        <button type="button" className="btn btn-primario" onClick={() => agregar(escribiendo)} disabled={!escribiendo.trim()}>
          <Plus size={17} /> Agregar
        </button>
      </div>

      {sugerencias.length > 0 && (
        <div className="piezas__sugerencias">
          {sugerencias.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => agregar(s)}>
              <Plus size={12} /> {s}
            </button>
          ))}
        </div>
      )}

      <ul className="piezas__lista">
        <AnimatePresence initial={false}>
          {piezas.map((p, i) => (
            <motion.li
              key={p.clave}
              layout
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, transition: { duration: 0.15 } }}
              className="piezas__item"
            >
              <span className="piezas__num">{i + 1}</span>
              <div className="piezas__textos">
                <input
                  className="piezas__nombre"
                  value={p.nombre}
                  onChange={(e) => cambiar(p.clave, { nombre: e.target.value })}
                  aria-label="Nombre de la pieza"
                  maxLength={150}
                />
                <input
                  className="piezas__nota"
                  value={p.observacion ?? ''}
                  onChange={(e) => cambiar(p.clave, { observacion: e.target.value })}
                  placeholder="Nota (opcional): color, serigrafía, sensor…"
                  aria-label="Observación"
                  maxLength={500}
                />
              </div>
              <div className="piezas__cantidad">
                <button type="button" onClick={() => cambiar(p.clave, { cantidad: Math.max(1, p.cantidad - 1) })} aria-label="Menos"><Minus size={14} /></button>
                <span>{p.cantidad}</span>
                <button type="button" onClick={() => cambiar(p.clave, { cantidad: Math.min(9999, p.cantidad + 1) })} aria-label="Más"><Plus size={14} /></button>
              </div>
              <button type="button" className="btn btn-fantasma btn-icono btn-peligro" onClick={() => onChange(piezas.filter((x) => x.clave !== p.clave))} aria-label="Quitar pieza">
                <Trash2 size={16} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

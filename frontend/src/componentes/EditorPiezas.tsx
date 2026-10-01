// Lista editable de piezas con el catalogo AGP (los mismos codigos de Modulo 5).
// Se escribe el codigo (000, 001...) o el nombre; si la pieza tiene simetrica
// (001 <-> 002) y el interruptor esta prendido, entra sola la del otro lado.
import { AnimatePresence, motion } from 'motion/react'
import { FlipHorizontal2, Plus, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { Pieza, PiezaCatalogo } from '@/api/tipos'
import './editor-piezas.css'

// las que mas se piden, para agregarlas con un clic
const RAPIDAS = ['000', '009', '001', '003', '005', '010', '017', '090']

export type PiezaEditable = Pieza & { clave: string }

let contador = 0
export const nuevaPieza = (nombre: string, codigo: string | null = null, observacion = ''): PiezaEditable =>
  ({ clave: `p${++contador}`, codigo, nombre, observacion })

interface Props {
  piezas: PiezaEditable[]
  onChange: (piezas: PiezaEditable[]) => void
  catalogo: PiezaCatalogo[]
}

export function EditorPiezas({ piezas, onChange, catalogo }: Props) {
  const [escribiendo, setEscribiendo] = useState('')
  const [simetria, setSimetria] = useState(true)
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null)
  const [resaltado, setResaltado] = useState(0)
  const entrada = useRef<HTMLInputElement>(null)

  const porCodigo = useMemo(() => new Map(catalogo.map((c) => [c.codigo, c])), [catalogo])
  const yaEsta = (codigo: string) => piezas.some((p) => p.codigo === codigo)

  const sugerencias = useMemo(() => {
    const q = escribiendo.trim().toLowerCase()
    if (!q) return []
    return catalogo
      .filter((c) => c.codigo.startsWith(q.padStart(Math.min(q.length, 3), '0')) || c.codigo.startsWith(q) || c.nombre.toLowerCase().includes(q))
      .slice(0, 6)
  }, [escribiendo, catalogo])

  const agregarDelCatalogo = (item: PiezaCatalogo, conSimetrica = simetria) => {
    const nuevas: PiezaEditable[] = []
    if (!yaEsta(item.codigo)) nuevas.push(nuevaPieza(item.nombre, item.codigo))
    const par = item.simetrica ? porCodigo.get(item.simetrica) : undefined
    if (conSimetrica && par && !yaEsta(par.codigo)) nuevas.push(nuevaPieza(par.nombre, par.codigo))

    if (!nuevas.length) {
      setAviso({ texto: `${item.codigo} ${item.nombre} ya está en la lista` })
    } else {
      onChange([...piezas, ...nuevas])
      setAviso(nuevas.length === 2 ? { texto: `También agregué la simétrica: ${par!.codigo} ${par!.nombre}` } : null)
    }
  }

  const agregar = (texto: string) => {
    const limpio = texto.trim()
    if (!limpio) return
    if (/^\d{1,3}$/.test(limpio)) {
      // escribieron un codigo: "1" o "001" es lo mismo
      const item = porCodigo.get(limpio.padStart(3, '0'))
      if (!item) return setAviso({ texto: `El código ${limpio.padStart(3, '0')} no existe en el catálogo`, error: true })
      agregarDelCatalogo(item)
    } else {
      const exacta = catalogo.find((c) => c.nombre.toLowerCase() === limpio.toLowerCase())
      if (exacta) agregarDelCatalogo(exacta)
      else {
        onChange([...piezas, nuevaPieza(limpio)])  // pieza que no esta en el catalogo: va como texto libre
        setAviso(null)
      }
    }
    setEscribiendo('')
    setResaltado(0)
    entrada.current?.focus()
  }

  const cambiarNota = (clave: string, observacion: string) =>
    onChange(piezas.map((p) => (p.clave === clave ? { ...p, observacion } : p)))

  return (
    <div className="piezas">
      <div className="piezas__agregar">
        <div className="piezas__buscador">
          <input
            ref={entrada}
            className="entrada"
            value={escribiendo}
            onChange={(e) => { setEscribiendo(e.target.value); setResaltado(0); setAviso(null) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && sugerencias.length) { e.preventDefault(); setResaltado((i) => (i + 1) % sugerencias.length) }
              if (e.key === 'ArrowUp' && sugerencias.length) { e.preventDefault(); setResaltado((i) => (i - 1 + sugerencias.length) % sugerencias.length) }
              if (e.key === 'Enter') {
                e.preventDefault()
                // si es un codigo exacto gana el codigo; si no, la sugerencia marcada
                if (/^\d{1,3}$/.test(escribiendo.trim()) || !sugerencias.length) agregar(escribiendo)
                else { agregarDelCatalogo(sugerencias[resaltado]); setEscribiendo('') }
              }
              if (e.key === 'Escape') setEscribiendo('')
            }}
            placeholder="Código o nombre: 000, 001, Parabrisas…"
            aria-label="Nueva pieza"
            autoComplete="off"
          />
          {sugerencias.length > 0 && (
            <ul className="piezas__sugerencias-lista vidrio" role="listbox">
              {sugerencias.map((s, i) => (
                <li key={s.codigo}>
                  <button
                    type="button"
                    className={i === resaltado ? 'activa' : ''}
                    onMouseDown={(e) => { e.preventDefault(); agregarDelCatalogo(s); setEscribiendo('') }}
                    disabled={yaEsta(s.codigo)}
                  >
                    <span className="piezas__codigo mono">{s.codigo}</span>
                    <span>{s.nombre}</span>
                    {s.simetrica && <span className="piezas__par" title="Tiene simétrica">↔ {s.simetrica}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn btn-primario" onClick={() => agregar(escribiendo)} disabled={!escribiendo.trim()}>
          <Plus size={17} /> Agregar
        </button>
      </div>

      <label className="piezas__simetria">
        <input type="checkbox" checked={simetria} onChange={(e) => setSimetria(e.target.checked)} />
        <span className="admin__interruptor-mini" />
        <FlipHorizontal2 size={15} />
        Agregar la simétrica automáticamente <span className="sutil">(ej: 001 → también 002)</span>
      </label>

      <AnimatePresence>
        {aviso && (
          <motion.p className={`piezas__aviso ${aviso.error ? 'error' : ''}`} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {aviso.texto}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="piezas__sugerencias">
        {RAPIDAS.map((c) => porCodigo.get(c)).filter((c): c is PiezaCatalogo => Boolean(c) && !yaEsta(c!.codigo)).map((c) => (
          <button key={c.codigo} type="button" className="chip" onClick={() => agregarDelCatalogo(c)}>
            <span className="mono">{c.codigo}</span> {c.nombre}
          </button>
        ))}
      </div>

      <ul className="piezas__lista">
        <AnimatePresence initial={false}>
          {piezas.map((p) => {
            const par = p.codigo ? porCodigo.get(p.codigo)?.simetrica : null
            const faltaPar = par && !yaEsta(par) ? porCodigo.get(par) : null
            return (
              <motion.li
                key={p.clave}
                layout
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 30, transition: { duration: 0.15 } }}
                className="piezas__item"
              >
                <span className={`piezas__codigo mono ${p.codigo ? '' : 'libre'}`} title={p.codigo ? 'Código AGP' : 'Pieza fuera del catálogo'}>
                  {p.codigo ?? '—'}
                </span>
                <div className="piezas__textos">
                  <span className="piezas__nombre">{p.nombre}</span>
                  <input
                    className="piezas__nota"
                    value={p.observacion ?? ''}
                    onChange={(e) => cambiarNota(p.clave, e.target.value)}
                    placeholder="Nota (opcional): color, serigrafía, sensor…"
                    aria-label={`Nota de ${p.nombre}`}
                    maxLength={500}
                  />
                </div>
                {faltaPar && (
                  <button type="button" className="btn btn-chico" onClick={() => agregarDelCatalogo(faltaPar, false)} title={`Agregar ${faltaPar.codigo} ${faltaPar.nombre}`}>
                    <FlipHorizontal2 size={14} /> {faltaPar.codigo}
                  </button>
                )}
                <button type="button" className="btn btn-fantasma btn-icono btn-peligro" onClick={() => onChange(piezas.filter((x) => x.clave !== p.clave))} aria-label={`Quitar ${p.nombre}`}>
                  <Trash2 size={16} />
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
    </div>
  )
}

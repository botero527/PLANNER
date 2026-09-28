// Panel que entra desde la derecha (el detalle del pedido) o modal centrado.
// Se cierra con Escape o dando clic afuera.
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './panel.css'

interface Props {
  abierto: boolean
  alCerrar: () => void
  children: ReactNode
  tipo?: 'lateral' | 'modal'
  ancho?: number
  etiqueta: string
}

export function Panel({ abierto, alCerrar, children, tipo = 'lateral', ancho, etiqueta }: Props) {
  useEffect(() => {
    if (!abierto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && alCerrar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, alCerrar])

  const lateral = tipo === 'lateral'
  return createPortal(
    <AnimatePresence>
      {abierto && (
        <motion.div
          className={`panel-fondo panel-fondo--${tipo}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={etiqueta}
            className={`panel panel--${tipo} vidrio`}
            style={ancho ? { width: `min(${ancho}px, 100vw)` } : undefined}
            initial={lateral ? { x: 60, opacity: 0 } : { y: 24, scale: 0.97, opacity: 0 }}
            animate={lateral ? { x: 0, opacity: 1 } : { y: 0, scale: 1, opacity: 1 }}
            exit={lateral ? { x: 60, opacity: 0 } : { y: 16, scale: 0.98, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

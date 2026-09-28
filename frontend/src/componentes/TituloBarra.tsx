// Cada pagina pone su titulo/acciones en la barra de arriba del Shell con un portal.
// Se busca el contenedor en un efecto porque en el primer render todavia no existe en el DOM.
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function TituloBarra({ children }: { children: ReactNode }) {
  const [destino, setDestino] = useState<HTMLElement | null>(null)
  useEffect(() => setDestino(document.getElementById('barra-titulo')), [])
  return destino ? createPortal(children, destino) : null
}

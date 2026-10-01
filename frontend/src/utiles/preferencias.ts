// Preferencias de cada persona (menu colapsado, como ver el tablero...) guardadas
// en su navegador. Si el navegador no deja guardar (modo privado), igual funciona,
// solo que no se acuerda la proxima vez.
import { useEffect, useState } from 'react'

export function usePreferencia<T extends string>(clave: string, defecto: T): [T, (v: T) => void] {
  const [valor, setValor] = useState<T>(() => {
    try {
      return (localStorage.getItem(`agp-${clave}`) as T) || defecto
    } catch {
      return defecto
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(`agp-${clave}`, valor)
    } catch {
      // sin permiso de guardar: no pasa nada
    }
  }, [clave, valor])
  return [valor, setValor]
}

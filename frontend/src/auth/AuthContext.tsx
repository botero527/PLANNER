// Quien esta logueado y que puede hacer. Cualquier componente hace:
//   const { usuario, puede } = useAuth()
//   if (puede('tarjeta.mover')) ...
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { escucharSesionVencida, sesion } from '@/api/cliente'
import { auth } from '@/api/endpoints'
import type { Yo } from '@/api/tipos'

interface Contexto {
  usuario: Yo | null
  cargando: boolean
  entrar: (usuario: string, password: string) => Promise<Yo>
  salir: () => void
  cambiarPassword: (actual: string, nueva: string) => Promise<void>
  puede: (permiso: string) => boolean
}

const AuthContext = createContext<Contexto | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Yo | null>(null)
  const [cargando, setCargando] = useState(() => Boolean(sesion.token()))

  // Si hay token guardado, le preguntamos al backend si sigue sirviendo
  useEffect(() => {
    if (!sesion.token()) return
    auth.yo()
      .then(setUsuario)
      .catch(() => sesion.borrar())
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => escucharSesionVencida(() => setUsuario(null)), [])

  const entrar = useCallback(async (nombre: string, password: string) => {
    const r = await auth.login(nombre, password)
    sesion.guardar(r.token)
    setUsuario(r.usuario)
    return r.usuario
  }, [])

  const salir = useCallback(() => {
    sesion.borrar()
    setUsuario(null)
  }, [])

  const cambiarPassword = useCallback(async (actual: string, nueva: string) => {
    const r = await auth.cambiarPassword(actual, nueva)
    sesion.guardar(r.token)
    setUsuario(r.usuario)
  }, [])

  const valor = useMemo<Contexto>(() => ({
    usuario,
    cargando,
    entrar,
    salir,
    cambiarPassword,
    puede: (permiso) => Boolean(usuario?.permisos.includes(permiso)),
  }), [usuario, cargando, entrar, salir, cambiarPassword])

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth tiene que usarse dentro de <AuthProvider>')
  return ctx
}

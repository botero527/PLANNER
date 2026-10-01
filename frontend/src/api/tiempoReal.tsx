// Conexion WebSocket unica para toda la app.
//
// Cuando llega un evento del servidor, en vez de parchar datos a mano,
// le decimos a React Query "esto ya esta viejo" (invalidateQueries) y el
// vuelve a pedirlo. Es un poquito mas de trafico pero imposible que la
// pantalla quede desincronizada con la base.
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { insertarMensaje, moverEnTablero, reemplazarMensaje, refrescarPronto } from './cacheLocal'
import { sesion } from './cliente'
import type { Mensaje, Personaje } from './tipos'

export interface UsuarioEnLinea {
  id: number
  nombre: string
  personaje: Personaje
}

export type Evento =
  | { tipo: 'presencia'; usuarios: UsuarioEnLinea[] }
  | { tipo: 'tablero.movido'; pedido_id: number; columna_id: number; posicion: number; por: UsuarioEnLinea; completado: boolean }
  | { tipo: 'tablero.cambio'; pedido_id?: number; motivo: string; por: number }
  | { tipo: 'pedido.cambio'; pedido_id: number; por: number }
  | { tipo: 'chat.mensaje' | 'chat.editado'; pedido_id: number; mensaje: Mensaje }
  | { tipo: 'adjuntos.cambio'; pedido_id: number }
  | { tipo: 'escribiendo'; pedido_id: number; usuario: { id: number; nombre: string } }
  | { tipo: 'notificacion'; accion: string; usuarios: number[]; pedido_id: number; titulo: string; actor: UsuarioEnLinea }

type Oyente = (e: Evento) => void

interface Contexto {
  conectado: boolean
  enLinea: UsuarioEnLinea[]
  escuchar: (fn: Oyente) => () => void
  enviar: (datos: object) => void
}

const TiempoRealContext = createContext<Contexto | null>(null)

export function TiempoRealProvider({ children, usuarioId }: { children: ReactNode; usuarioId: number }) {
  const qc = useQueryClient()
  const ws = useRef<WebSocket | null>(null)
  const oyentes = useRef(new Set<Oyente>())
  const [conectado, setConectado] = useState(false)
  const [enLinea, setEnLinea] = useState<UsuarioEnLinea[]>([])

  useEffect(() => {
    let cerradoAProposito = false
    let intento = 0
    let reintento: number
    let latido: number

    const conectar = () => {
      const protocolo = location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${protocolo}://${location.host}/ws?token=${sesion.token() ?? ''}`)
      ws.current = socket

      socket.onopen = () => {
        intento = 0
        setConectado(true)
        // al reconectar pudimos perdernos eventos: refrescamos todo
        qc.invalidateQueries()
        latido = window.setInterval(() => socket.readyState === 1 && socket.send('{"tipo":"ping"}'), 25000)
      }

      socket.onmessage = (m) => {
        const evento = JSON.parse(m.data) as Evento | { tipo: 'pong' }
        if (evento.tipo === 'pong') return
        manejar(evento)
        oyentes.current.forEach((fn) => fn(evento))
      }

      socket.onclose = () => {
        setConectado(false)
        window.clearInterval(latido)
        if (cerradoAProposito) return
        // backoff: 1s, 2s, 4s... hasta 30s maximo
        reintento = window.setTimeout(conectar, Math.min(30000, 1000 * 2 ** intento++))
      }
    }

    const manejar = (e: Evento) => {
      switch (e.tipo) {
        case 'presencia':
          setEnLinea(e.usuarios)
          break
        case 'tablero.movido':
          // la tarjeta se mueve de una en pantalla; la recarga completa va despues y agrupada
          moverEnTablero(qc, e.pedido_id, e.columna_id, e.posicion)
          refrescarPronto(qc, ['tablero'])
          refrescarPronto(qc, ['pedido', e.pedido_id])
          refrescarPronto(qc, ['historial', e.pedido_id])
          break
        case 'tablero.cambio':
          refrescarPronto(qc, ['tablero'])
          if (e.pedido_id) {
            refrescarPronto(qc, ['pedido', e.pedido_id])
            refrescarPronto(qc, ['historial', e.pedido_id])
          }
          break
        case 'pedido.cambio':
          refrescarPronto(qc, ['pedido', e.pedido_id])
          refrescarPronto(qc, ['tablero'])
          break
        case 'chat.mensaje':
          // el evento trae el mensaje completo: se mete directo, sin pedir nada al servidor
          insertarMensaje(qc, e.mensaje)
          break
        case 'chat.editado':
          reemplazarMensaje(qc, e.mensaje)
          break
        case 'adjuntos.cambio':
          refrescarPronto(qc, ['adjuntos', e.pedido_id])
          refrescarPronto(qc, ['mensajes', e.pedido_id])  // los archivos del chat van pegados al mensaje
          refrescarPronto(qc, ['tablero'])
          break
        case 'notificacion':
          if (e.usuarios.includes(usuarioId)) refrescarPronto(qc, ['notificaciones'], 200)
          if (e.pedido_id) refrescarPronto(qc, ['historial', e.pedido_id])
          break
      }
    }

    conectar()
    return () => {
      cerradoAProposito = true
      window.clearTimeout(reintento)
      window.clearInterval(latido)
      ws.current?.close()
    }
  }, [qc, usuarioId])

  const escuchar = useCallback((fn: Oyente) => {
    oyentes.current.add(fn)
    return () => {
      oyentes.current.delete(fn)
    }
  }, [])

  const enviar = useCallback((datos: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(datos))
  }, [])

  return (
    <TiempoRealContext.Provider value={{ conectado, enLinea, escuchar, enviar }}>
      {children}
    </TiempoRealContext.Provider>
  )
}

export function useTiempoReal() {
  const ctx = useContext(TiempoRealContext)
  if (!ctx) throw new Error('useTiempoReal tiene que usarse dentro de <TiempoRealProvider>')
  return ctx
}

/** Se suscribe a eventos mientras el componente este montado */
export function useEvento(fn: Oyente) {
  const { escuchar } = useTiempoReal()
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => escuchar((e) => ref.current(e)), [escuchar])
}

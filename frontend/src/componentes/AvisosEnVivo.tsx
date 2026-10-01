// Toasts cuando OTRA persona hace algo (lo mio ya lo veo en pantalla).
import { toast } from 'sonner'
import { useEvento } from '@/api/tiempoReal'
import { useAuth } from '@/auth/AuthContext'
import { celebrar } from '@/utiles/confeti'
import { Personaje } from './personajes/Personaje'

export function AvisosEnVivo() {
  const { usuario } = useAuth()

  useEvento((e) => {
    if (!usuario || e.tipo !== 'notificacion') return
    if (!e.usuarios.includes(usuario.id)) return
    if (e.accion === 'pedido.completado') celebrar()
    // si ya tengo abierto ese pedido, los mensajes del chat los estoy viendo: sin toast
    const abierto = new URLSearchParams(window.location.search).get('pedido') === String(e.pedido_id)
    if (abierto && e.accion.startsWith('chat.')) return

    toast.custom(() => (
      <div className="aviso-vivo vidrio">
        <Personaje personaje={e.actor.personaje} tamano={46} expresion="feliz" quieto />
        <div>
          <strong>{e.actor.nombre}</strong>
          <p>{e.titulo}</p>
        </div>
      </div>
    ), { duration: 5000 })
  })

  return null
}

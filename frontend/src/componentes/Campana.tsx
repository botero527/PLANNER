import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { Bell, CheckCheck, Settings2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificaciones } from '@/api/endpoints'
import { haceCuanto } from '@/utiles/formato'
import { MisAlertas } from './MisAlertas'
import { Personaje } from './personajes/Personaje'
import './campana.css'

const ICONO: Record<string, string> = {
  'pedido.creado': '📦', 'pedido.movido': '➡️', 'pedido.completado': '🎉', 'pedido.asignado': '🙋',
  'pedido.editado': '✏️', 'chat.mensaje': '💬', 'chat.mencion': '📣', 'adjunto.subido': '📎',
  'ingreso.codigo_creado': '🔑', 'ingreso.pedido_ingresado': '🧾', 'ingreso.aprobado': '✅',
}

export function Campana() {
  const [abierta, setAbierta] = useState(false)
  const [verAlertas, setVerAlertas] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const navegar = useNavigate()
  const { data } = useQuery({ queryKey: ['notificaciones'], queryFn: notificaciones.bandeja, refetchInterval: 60000 })
  const leer = useMutation({
    mutationFn: notificaciones.leer,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificaciones'] }),
  })

  useEffect(() => {
    if (!abierta) return
    const fuera = (e: MouseEvent) => !caja.current?.contains(e.target as Node) && setAbierta(false)
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierta])

  const sinLeer = data?.sin_leer ?? 0

  return (
    <div className="campana" ref={caja}>
      <motion.button
        className="btn btn-fantasma btn-icono"
        onClick={() => setAbierta((a) => !a)}
        aria-label={`Notificaciones, ${sinLeer} sin leer`}
        animate={sinLeer ? { rotate: [0, -14, 12, -8, 6, 0] } : { rotate: 0 }}
        transition={{ duration: 0.7 }}
        key={sinLeer}
      >
        <Bell size={19} />
        {sinLeer > 0 && <span className="campana__globo">{sinLeer > 99 ? '99+' : sinLeer}</span>}
      </motion.button>

      <AnimatePresence>
        {abierta && (
          <motion.div
            className="campana__lista vidrio"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
          >
            <div className="campana__cabeza">
              <strong>Notificaciones</strong>
              {sinLeer > 0 && (
                <button className="btn btn-fantasma btn-chico" onClick={() => leer.mutate({})}>
                  <CheckCheck size={15} /> Marcar todas
                </button>
              )}
            </div>
            <button className="campana__config" onClick={() => { setAbierta(false); setVerAlertas(true) }}>
              <Settings2 size={14} /> Configurar mis alertas por correo
            </button>
            {!data?.items.length ? (
              <div className="campana__vacia">
                <Personaje expresion="dormido" tamano={70} />
                <p>Todo tranquilo por aquí</p>
              </div>
            ) : (
              <ul>
                {data.items.map((n) => (
                  <li key={n.id}>
                    <button
                      className={`campana__item ${n.leida_en ? '' : 'nueva'}`}
                      onClick={() => {
                        if (!n.leida_en) leer.mutate({ ids: [n.id] })
                        if (n.pedido_id) navegar(`/tablero?pedido=${n.pedido_id}`)
                        setAbierta(false)
                      }}
                    >
                      <span className="campana__icono">{ICONO[n.tipo] ?? '🔔'}</span>
                      <span className="campana__texto">
                        <strong>{n.titulo}</strong>
                        {n.cuerpo && <span>{n.cuerpo}</span>}
                        <small>{haceCuanto(n.creado_en)}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <MisAlertas abierto={verAlertas} alCerrar={() => setVerAlertas(false)} />
    </div>
  )
}

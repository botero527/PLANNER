// "Mis alertas": cada persona escoge que avisos le llegan a Outlook.
// La campanita de la app siempre recibe todo; esto es solo el correo.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailCheck, MailX, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { auth } from '@/api/endpoints'
import type { MisAlertas as Datos } from '@/api/tipos'
import { Panel } from './Panel'
import { Personaje } from './personajes/Personaje'
import './mis-alertas.css'

const MODOS: Record<string, string> = {
  simulado: 'Modo prueba: los correos se guardan en el servidor, todavía no salen a Outlook',
  powerautomate: 'Los correos salen por Power Automate',
  graph: 'Los correos salen por Microsoft 365',
}

export function MisAlertas({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const { data } = useQuery({ queryKey: ['mis-alertas'], queryFn: auth.alertas, enabled: abierto })
  return (
    <Panel abierto={abierto} alCerrar={alCerrar} tipo="modal" etiqueta="Mis alertas" ancho={560}>
      {data ? <Formulario key={JSON.stringify(data)} datos={data} alCerrar={alCerrar} /> : <div className="alertas"><p className="sutil">Cargando…</p></div>}
    </Panel>
  )
}

function Formulario({ datos, alCerrar }: { datos: Datos; alCerrar: () => void }) {
  const qc = useQueryClient()
  const [recibir, setRecibir] = useState(datos.recibir_correos)
  const [activas, setActivas] = useState(new Set(datos.activas))

  const guardar = useMutation({
    mutationFn: () => auth.guardarAlertas(recibir, [...activas]),
    onSuccess: (d) => {
      qc.setQueryData(['mis-alertas'], d)
      toast.success('Listo, tus alertas quedaron guardadas')
      alCerrar()
    },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo guardar'),
  })
  const prueba = useMutation({
    mutationFn: auth.probarAlertas,
    onSuccess: (r) => toast.success(r.modo_envio === 'simulado'
      ? `Correo de prueba en cola para ${r.para} (modo prueba: no sale a Outlook todavía)`
      : `Te mandé un correo de prueba a ${r.para}. Revisa Outlook en un minuto 📬`),
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo enviar la prueba'),
  })

  const alternar = (id: string) => setActivas((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })

  return (
    <div className="alertas">
      <header className="alertas__cabeza">
        <Personaje expresion={recibir ? 'feliz' : 'dormido'} tamano={64} />
        <div>
          <h2>Mis alertas por correo</h2>
          <p className="sutil">{datos.correo ? <>Te llegan a <b>{datos.correo}</b></> : 'No tienes correo registrado: pídele al admin que lo agregue en Equipo.'}</p>
        </div>
      </header>

      <p className={`alertas__modo ${datos.modo_envio === 'simulado' ? 'prueba' : ''}`}>{MODOS[datos.modo_envio] ?? datos.modo_envio}</p>

      <label className="admin__interruptor alertas__general">
        <input type="checkbox" checked={recibir} onChange={(e) => setRecibir(e.target.checked)} />
        <span />
        {recibir ? <><MailCheck size={17} /> Quiero recibir correos</> : <><MailX size={17} /> No quiero correos (solo la campanita)</>}
      </label>

      <ul className={`alertas__lista ${recibir ? '' : 'apagada'}`}>
        {datos.eventos.map((e) => (
          <li key={e.id}>
            <label className={`config__evento ${activas.has(e.id) ? 'activo' : ''}`}>
              <input type="checkbox" checked={activas.has(e.id)} disabled={!recibir} onChange={() => alternar(e.id)} />
              <span className="admin__interruptor-mini" />
              <span className="alertas__texto">
                <strong>{e.nombre}</strong>
                <small>{e.descripcion}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {!datos.personalizadas && <p className="sutil alertas__nota">Estás usando las alertas que dejó el administrador. Si cambias algo, quedan las tuyas.</p>}

      <footer className="alertas__pie">
        <button className="btn" onClick={() => prueba.mutate()} disabled={prueba.isPending || !datos.correo}>
          <Send size={15} /> {prueba.isPending ? 'Enviando…' : 'Mandarme una prueba'}
        </button>
        <button className="btn btn-primario" onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          {guardar.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </footer>
    </div>
  )
}

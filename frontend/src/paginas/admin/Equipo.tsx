// Administracion de usuarios: crear, cambiar rol/personaje, activar y resetear clave.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Copy, KeyRound, MailCheck, MailX, Pencil, Search, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { usuarios } from '@/api/endpoints'
import type { Personaje as TipoPersonaje, Rol, Usuario } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Avatar } from '@/componentes/Avatar'
import { Panel } from '@/componentes/Panel'
import { PALETA, Personaje } from '@/componentes/personajes/Personaje'
import { TituloBarra } from '@/componentes/TituloBarra'
import { haceCuanto } from '@/utiles/formato'
import './admin.css'

const PERSONAJES = Object.keys(PALETA) as TipoPersonaje[]

function claveTemporal() {
  // sin letras que se confunden (0/O, 1/l/I) porque esto se dicta por telefono
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const aleatorio = crypto.getRandomValues(new Uint32Array(10))
  return Array.from(aleatorio, (n) => letras[n % letras.length]).join('')
}

const error = (e: unknown) => toast.error(e instanceof ErrorApi ? e.message : 'Algo salió mal')

export default function Equipo() {
  const { usuario: yo } = useAuth()
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Usuario | 'nuevo' | null>(null)
  const [claveMostrada, setClaveMostrada] = useState<{ usuario: string; clave: string } | null>(null)
  const { data: lista = [] } = useQuery({ queryKey: ['usuarios'], queryFn: usuarios.listar })
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: usuarios.roles })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['usuarios'] })
    qc.invalidateQueries({ queryKey: ['equipo'] })
  }

  const resetear = useMutation({
    mutationFn: (u: Usuario) => {
      const clave = claveTemporal()
      return usuarios.resetPassword(u.id, clave).then(() => ({ usuario: u.usuario, clave }))
    },
    onSuccess: (r) => { setClaveMostrada(r); refrescar() },
    onError: error,
  })

  const correos = useMutation({
    mutationFn: (u: Usuario) => usuarios.editar(u.id, { recibir_correos: !u.recibir_correos }),
    onSuccess: refrescar,
    onError: error,
  })

  const filtrados = lista.filter((u) => `${u.nombre} ${u.usuario} ${u.rol.nombre}`.toLowerCase().includes(busqueda.toLowerCase()))

  return (
    <div className="admin">
      <TituloBarra>
        <div className="tablero__barra">
          <h1 className="titulo-pagina">Equipo</h1>
          <label className="tablero__buscar">
            <Search size={16} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar persona…" />
          </label>
          <button className="btn btn-primario" onClick={() => setEditando('nuevo')}><UserPlus size={17} /> Agregar persona</button>
        </div>
      </TituloBarra>

      <div className="equipo__roles">
        {roles.map((r) => (
          <div key={r.id} className="equipo__rol vidrio" style={{ '--c': r.color } as React.CSSProperties}>
            <strong>{lista.filter((u) => u.rol.id === r.id && u.activo).length}</strong>
            <span>{r.nombre}</span>
          </div>
        ))}
      </div>

      <ul className="equipo__lista">
        {filtrados.map((u, i) => (
          <motion.li key={u.id} className={`equipo__persona vidrio ${u.activo ? '' : 'inactivo'}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }}>
            <Avatar usuario={u} tamano={46} />
            <div className="equipo__info">
              <strong>{u.nombre} {u.id === yo?.id && <span className="chip">Tú</span>}</strong>
              <span className="mono">@{u.usuario}</span>
              <span>{u.correo ?? 'sin correo'}</span>
            </div>
            <span className="chip equipo__chip-rol" style={{ color: u.rol.color, borderColor: `${u.rol.color}66` }}>{u.rol.nombre}</span>
            <div className="equipo__estado">
              {!u.activo ? <span className="chip">Inactivo</span> : u.debe_cambiar_password ? <span className="chip" style={{ color: 'var(--alerta)' }}>Clave temporal</span> : null}
              <small className="sutil">{u.ultimo_acceso ? `Entró ${haceCuanto(u.ultimo_acceso)}` : 'Nunca ha entrado'}</small>
            </div>
            <div className="equipo__acciones">
              <button className="btn btn-fantasma btn-icono" title={u.recibir_correos ? 'Recibe correos (clic para apagar)' : 'No recibe correos (clic para prender)'} onClick={() => correos.mutate(u)}>
                {u.recibir_correos ? <MailCheck size={17} /> : <MailX size={17} className="sutil" />}
              </button>
              <button className="btn btn-fantasma btn-icono" title="Resetear contraseña" onClick={() => window.confirm(`¿Generar una clave temporal nueva para ${u.nombre}? Su sesión actual se cerrará.`) && resetear.mutate(u)}>
                <KeyRound size={17} />
              </button>
              <button className="btn btn-fantasma btn-icono" title="Editar" onClick={() => setEditando(u)}><Pencil size={17} /></button>
            </div>
          </motion.li>
        ))}
      </ul>

      <Panel abierto={editando !== null} alCerrar={() => setEditando(null)} tipo="modal" etiqueta="Persona" ancho={560}>
        {editando !== null && (
          <FormularioPersona
            persona={editando === 'nuevo' ? null : editando}
            roles={roles}
            esYo={editando !== 'nuevo' && editando.id === yo?.id}
            alTerminar={(clave) => {
              setEditando(null)
              refrescar()
              if (clave) setClaveMostrada(clave)
            }}
          />
        )}
      </Panel>

      <Panel abierto={claveMostrada !== null} alCerrar={() => setClaveMostrada(null)} tipo="modal" etiqueta="Clave temporal" ancho={440}>
        {claveMostrada && (
          <div className="admin__modal admin__clave">
            <Personaje personaje="jefa" expresion="guiño" tamano={80} />
            <h2>Clave temporal de @{claveMostrada.usuario}</h2>
            <p className="sutil">Pásasela a la persona. Solo se muestra esta vez; al entrar el sistema le pide que ponga la suya.</p>
            <button className="admin__clave-valor mono" onClick={() => { navigator.clipboard.writeText(claveMostrada.clave); toast.success('Copiada') }}>
              {claveMostrada.clave} <Copy size={16} />
            </button>
            <button className="btn btn-primario" onClick={() => setClaveMostrada(null)}>Listo</button>
          </div>
        )}
      </Panel>
    </div>
  )
}

function FormularioPersona({ persona, roles, esYo, alTerminar }: { persona: Usuario | null; roles: Rol[]; esYo: boolean; alTerminar: (clave?: { usuario: string; clave: string }) => void }) {
  const [f, setF] = useState({
    usuario: persona?.usuario ?? '',
    nombre: persona?.nombre ?? '',
    correo: persona?.correo ?? '',
    rol_id: persona?.rol.id ?? roles.find((r) => r.codigo === 'comercial')?.id ?? roles[0]?.id ?? 0,
    personaje: persona?.personaje ?? ('vidrito' as TipoPersonaje),
    activo: persona?.activo ?? true,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      const comun = { nombre: f.nombre, correo: f.correo || null, personaje: f.personaje }
      if (persona) {
        await usuarios.editar(persona.id, esYo ? comun : { ...comun, rol_id: f.rol_id, activo: f.activo })
        return undefined
      }
      const clave = claveTemporal()
      await usuarios.crear({ ...comun, usuario: f.usuario, rol_id: f.rol_id, password_temporal: clave })
      return { usuario: f.usuario.toLowerCase(), clave }
    },
    onSuccess: (clave) => {
      toast.success(persona ? 'Cambios guardados' : 'Persona creada')
      alTerminar(clave)
    },
    onError: error,
  })

  return (
    <form className="admin__modal" onSubmit={(e) => { e.preventDefault(); guardar.mutate() }}>
      <h2>{persona ? `Editar a ${persona.nombre.split(' ')[0]}` : 'Nueva persona'}</h2>

      <div className="campo">
        <label>Personaje</label>
        <div className="admin__personajes">
          {PERSONAJES.map((p) => (
            <button type="button" key={p} className={f.personaje === p ? 'activo' : ''} onClick={() => setF({ ...f, personaje: p })} title={PALETA[p].nombre}>
              <Personaje personaje={p} tamano={52} expresion={f.personaje === p ? 'celebrando' : 'feliz'} quieto={f.personaje !== p} />
              <span>{PALETA[p].nombre}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="rejilla-2">
        <div className="campo">
          <label htmlFor="u-usuario">Usuario</label>
          <input id="u-usuario" className="entrada mono" required minLength={3} maxLength={50} pattern="[A-Za-z0-9._]+" disabled={Boolean(persona)} value={f.usuario}
            onChange={(e) => setF({ ...f, usuario: e.target.value.toLowerCase() })} placeholder="camila.rojas" />
        </div>
        <div className="campo">
          <label htmlFor="u-nombre">Nombre</label>
          <input id="u-nombre" className="entrada" required minLength={2} maxLength={120} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Camila Rojas" />
        </div>
        <div className="campo">
          <label htmlFor="u-correo">Correo (para avisos)</label>
          <input id="u-correo" className="entrada" type="email" value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} placeholder="nombre@agpglass.com" />
        </div>
        <div className="campo">
          <label htmlFor="u-rol">Rol</label>
          <select id="u-rol" className="entrada" disabled={esYo} value={f.rol_id} onChange={(e) => setF({ ...f, rol_id: Number(e.target.value) })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </div>
      </div>

      {persona && !esYo && (
        <label className="admin__interruptor">
          <input type="checkbox" checked={f.activo} onChange={(e) => setF({ ...f, activo: e.target.checked })} />
          <span />
          {f.activo ? 'Activo: puede entrar' : 'Inactivo: no puede entrar'}
        </label>
      )}
      {!persona && <p className="sutil" style={{ margin: 0, fontSize: 13 }}>Al crearla te muestro una clave temporal para que se la pases.</p>}

      <div className="detalles__botones">
        <button type="button" className="btn" onClick={() => alTerminar()}>Cancelar</button>
        <button className="btn btn-primario" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  )
}

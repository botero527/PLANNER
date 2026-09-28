// Pantalla de entrada. El personaje grande sigue el cursor con los ojos,
// se tapa los ojos cuando escribes la contrasena y celebra cuando entras.
import { motion } from 'motion/react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente'
import { useAuth } from '@/auth/AuthContext'
import { Personaje, type Expresion } from '@/componentes/personajes/Personaje'
import { rutaInicio } from '@/utiles/rutas'
import './login.css'

export default function Login() {
  const { entrar } = useAuth()
  const navegar = useNavigate()
  const [usuario, setUsuario] = useState('')
  const [password, setPassword] = useState('')
  const [verClave, setVerClave] = useState(false)
  const [enClave, setEnClave] = useState(false)
  const [estado, setEstado] = useState<'normal' | 'cargando' | 'error' | 'listo'>('normal')
  const [error, setError] = useState('')

  const expresion: Expresion =
    estado === 'listo' ? 'celebrando'
      : estado === 'error' ? 'triste'
        : estado === 'cargando' ? 'pensando'
          : enClave && !verClave ? 'tapado'
            : enClave && verClave ? 'guiño'
              : 'feliz'

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!usuario.trim() || !password) return
    setEstado('cargando')
    setError('')
    try {
      const yo = await entrar(usuario, password)
      setEstado('listo')
      // un instante para que se vea la celebracion antes de cambiar de pantalla
      window.setTimeout(() => navegar(yo.debe_cambiar_password ? '/cambiar-clave' : rutaInicio(yo), { replace: true }), 900)
    } catch (err) {
      setEstado('error')
      setError(err instanceof ErrorApi ? err.message : 'No se pudo entrar')
      window.setTimeout(() => setEstado((s) => (s === 'error' ? 'normal' : s)), 1400)
    }
  }

  return (
    <div className="login">
      <section className="login__escena" aria-hidden="true">
        <motion.div className="login__marca" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <span className="login__logo">AGP</span>
          <span className="login__producto">Planner</span>
        </motion.div>

        <div className="login__protagonista">
          <Personaje personaje="vidrito" expresion={expresion} tamano={210} seguirCursor={expresion === 'feliz'} />
        </div>

        <div className="login__elenco">
          {(['vendedora', 'trazos', 'tuerca', 'jefa'] as const).map((p, i) => (
            <motion.div
              key={p}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 + i * 0.12, type: 'spring', stiffness: 200, damping: 16 }}
            >
              <Personaje
                personaje={p}
                tamano={78}
                expresion={estado === 'listo' ? 'celebrando' : enClave && !verClave ? 'tapado' : 'feliz'}
                seguirCursor={!enClave}
              />
            </motion.div>
          ))}
        </div>
        <div className="login__repisa" />
        <p className="login__lema">
          Del pedido del <b>comercial</b> al plano del <b>dibujante</b> y la revisión del <b>técnico</b>.
          <br />Todo en un solo tablero.
        </p>
      </section>

      <section className="login__lado">
        <motion.form
          className="login__tarjeta vidrio borde-prisma"
          onSubmit={enviar}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={estado === 'error' ? { x: [0, -10, 10, -6, 6, 0], opacity: 1, y: 0, scale: 1 } : { opacity: 1, y: 0, scale: 1, x: 0 }}
          transition={{ duration: estado === 'error' ? 0.45 : 0.5 }}
        >
          <div className="login__mini-personaje">
            <Personaje personaje="vidrito" expresion={expresion} tamano={64} />
          </div>
          <h1 className="login__titulo">¡Hola de nuevo!</h1>
          <p className="login__subtitulo">Entra con tu usuario del planner</p>

          <div className="campo">
            <label htmlFor="usuario">Usuario</label>
            <input
              id="usuario"
              className="entrada"
              autoComplete="username"
              autoFocus
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="ej: camila.rojas"
            />
          </div>

          <div className="campo">
            <label htmlFor="password">Contraseña</label>
            <div className="login__clave">
              <input
                id="password"
                className="entrada"
                type={verClave ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setEnClave(true)}
                onBlur={() => setEnClave(false)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="btn btn-fantasma btn-icono login__ojo"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setVerClave((v) => !v)}
                aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {verClave ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <p className="login__error" role="alert">{error}</p>

          <button className="btn btn-primario btn-grande" disabled={estado === 'cargando' || estado === 'listo'}>
            {estado === 'cargando' ? 'Revisando…' : estado === 'listo' ? '¡Adentro!' : <>Entrar <LogIn size={18} /></>}
          </button>
          <p className="login__nota">¿Se te olvidó la clave? Pídele al administrador que te la resetee.</p>
        </motion.form>
      </section>
    </div>
  )
}

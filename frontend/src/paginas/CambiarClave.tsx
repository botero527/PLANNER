// Se muestra obligado la primera vez (o despues de que el admin resetea la clave).
import { motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente'
import { useAuth } from '@/auth/AuthContext'
import { Personaje } from '@/componentes/personajes/Personaje'
import { rutaInicio } from '@/utiles/rutas'
import './login.css'

function fuerza(clave: string): number {
  let puntos = 0
  if (clave.length >= 8) puntos++
  if (clave.length >= 12) puntos++
  if (/[A-Z]/.test(clave) && /[a-z]/.test(clave)) puntos++
  if (/\d/.test(clave)) puntos++
  if (/[^A-Za-z0-9]/.test(clave)) puntos++
  return Math.min(puntos, 4)
}

const NIVELES = ['Muy débil', 'Débil', 'Aceptable', 'Buena', '¡Excelente!']
const COLORES = ['var(--peligro)', 'var(--peligro)', 'var(--alerta)', 'var(--info)', 'var(--exito)']

export default function CambiarClave() {
  const { usuario, cambiarPassword, salir } = useAuth()
  const navegar = useNavigate()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const nivel = fuerza(nueva)
  const noCoinciden = repetir.length > 0 && repetir !== nueva

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (nueva.length < 8) return setError('La nueva contraseña necesita mínimo 8 caracteres')
    if (noCoinciden) return setError('Las dos contraseñas no coinciden')
    setEnviando(true)
    setError('')
    try {
      await cambiarPassword(actual, nueva)
      if (usuario) navegar(rutaInicio(usuario), { replace: true })
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo cambiar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="login" style={{ gridTemplateColumns: '1fr' }}>
      <section className="login__lado">
        <motion.form className="login__tarjeta vidrio borde-prisma" onSubmit={enviar} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Personaje personaje={usuario?.personaje ?? 'vidrito'} expresion={nivel >= 3 ? 'celebrando' : 'pensando'} tamano={90} />
          </div>
          <h1 className="login__titulo">Ponle tu propia clave</h1>
          <p className="login__subtitulo">
            {usuario?.nombre.split(' ')[0]}, la que tienes es temporal. Crea una que solo sepas tú.
          </p>

          <div className="campo">
            <label htmlFor="actual">Contraseña temporal</label>
            <input id="actual" className="entrada" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="nueva">Nueva contraseña</label>
            <input id="nueva" className="entrada" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
            {nueva && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} style={{ flex: 1, height: 5, borderRadius: 4, background: i < nivel ? COLORES[nivel] : 'var(--borde)', transition: 'background .2s' }} />
                  ))}
                </div>
                <span className="ayuda-campo" style={{ color: COLORES[nivel] }}>{NIVELES[nivel]}</span>
              </div>
            )}
          </div>
          <div className="campo">
            <label htmlFor="repetir">Repítela</label>
            <input id="repetir" className="entrada" type="password" autoComplete="new-password" aria-invalid={noCoinciden} value={repetir} onChange={(e) => setRepetir(e.target.value)} />
          </div>

          <p className="login__error" role="alert">{error}</p>
          <button className="btn btn-primario btn-grande" disabled={enviando || !actual || !nueva || !repetir}>
            {enviando ? 'Guardando…' : 'Guardar y entrar'}
          </button>
          <button type="button" className="btn btn-fantasma" onClick={salir}>Salir</button>
        </motion.form>
      </section>
    </div>
  )
}

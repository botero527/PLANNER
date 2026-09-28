// El "marco" de la app ya logueado: menu lateral + barra de arriba + contenido.
import { AnimatePresence, motion } from 'motion/react'
import { KanbanSquare, LogOut, Moon, PackagePlus, Settings2, Sun, Users, ClipboardList } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useOutlet } from 'react-router-dom'
import { useTiempoReal } from '@/api/tiempoReal'
import { useAuth } from '@/auth/AuthContext'
import { Avatar, PilaAvatares } from './Avatar'
import { Campana } from './Campana'
import { AvisosEnVivo } from './AvisosEnVivo'
import { Personaje } from './personajes/Personaje'
import './shell.css'

type Tema = 'oscuro' | 'claro'

function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      return (localStorage.getItem('agp-tema') as Tema) || 'oscuro'
    } catch {
      return 'oscuro'
    }
  })
  useEffect(() => {
    document.documentElement.dataset.tema = tema
    try {
      localStorage.setItem('agp-tema', tema)
    } catch {
      // modo privado: no pasa nada, solo no se recuerda
    }
  }, [tema])
  return [tema, () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'))]
}

export function Shell() {
  const { usuario, puede, salir } = useAuth()
  const { conectado, enLinea } = useTiempoReal()
  const [tema, alternarTema] = useTema()
  const ubicacion = useLocation()
  // useOutlet() y no <Outlet />: <Outlet /> siempre pinta la ruta ACTUAL, entonces
  // durante la animacion de salida la pagina vieja ya mostraba la nueva y habia
  // dos copias vivas (lo que uno escribia en la primera se perdia). Con useOutlet
  // cada motion.div se queda con SU pagina.
  const pagina = useOutlet()

  if (!usuario) return null
  const otros = enLinea.filter((u) => u.id !== usuario.id)

  const menu = [
    puede('pedido.crear') && { a: '/mis-pedidos', icono: ClipboardList, texto: 'Mis pedidos' },
    puede('pedido.crear') && { a: '/nuevo', icono: PackagePlus, texto: 'Nuevo pedido' },
    puede('pedido.ver') && { a: '/tablero', icono: KanbanSquare, texto: 'Tablero' },
    puede('usuario.administrar') && { a: '/admin/usuarios', icono: Users, texto: 'Equipo' },
    puede('tablero.configurar') && { a: '/admin/tablero', icono: Settings2, texto: 'Configurar' },
  ].filter(Boolean) as { a: string; icono: typeof Users; texto: string }[]

  return (
    <div className="shell">
      <aside className="shell__menu vidrio">
        <div className="shell__marca">
          <span className="shell__logo">AGP</span>
          <span className="shell__producto">Planner</span>
        </div>

        <nav className="shell__nav">
          {menu.map(({ a, icono: Icono, texto }) => (
            <NavLink key={a} to={a} className={({ isActive }) => `shell__enlace ${isActive ? 'activo' : ''}`}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="enlace-activo" className="shell__enlace-fondo" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
                  <Icono size={19} />
                  <span>{texto}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="shell__mascota" aria-hidden="true">
          <Personaje personaje={usuario.personaje} tamano={70} expresion={conectado ? 'feliz' : 'dormido'} />
          <p>{conectado ? `¡Vamos con toda, ${usuario.nombre.split(' ')[0]}!` : 'Reconectando…'}</p>
        </div>

        <div className="shell__yo">
          <Avatar usuario={usuario} tamano={38} enLinea={conectado} />
          <div className="shell__yo-texto">
            <strong>{usuario.nombre}</strong>
            <span style={{ color: usuario.rol.color }}>{usuario.rol.nombre}</span>
          </div>
          <button className="btn btn-fantasma btn-icono" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="shell__cuerpo">
        <header className="shell__barra">
          <div className="shell__barra-izq" id="barra-titulo" />
          <div className="shell__barra-der">
            {otros.length > 0 && (
              <div className="shell__en-linea" title={otros.map((u) => u.nombre).join(', ')}>
                <PilaAvatares usuarios={otros.map((u) => ({ ...u, usuario: '' }))} max={4} tamano={30} />
                <span>{otros.length} en línea</span>
              </div>
            )}
            <span className={`shell__conexion ${conectado ? 'ok' : ''}`} title={conectado ? 'En vivo' : 'Sin conexión en vivo'} />
            <button className="btn btn-fantasma btn-icono" onClick={alternarTema} aria-label="Cambiar tema">
              {tema === 'oscuro' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Campana />
          </div>
        </header>

        <main className="shell__contenido">
          <AnimatePresence mode="wait">
            <motion.div
              key={ubicacion.pathname}
              className="shell__pagina"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
            >
              {pagina}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <AvisosEnVivo />
    </div>
  )
}

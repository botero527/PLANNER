import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { TiempoRealProvider } from '@/api/tiempoReal'
import { useAuth } from '@/auth/AuthContext'
import { Personaje } from '@/componentes/personajes/Personaje'
import { Shell } from '@/componentes/Shell'
import ConfigTablero from '@/paginas/admin/ConfigTablero'
import Equipo from '@/paginas/admin/Equipo'
import CambiarClave from '@/paginas/CambiarClave'
import Login from '@/paginas/Login'
import MisPedidos from '@/paginas/MisPedidos'
import NuevoPedido from '@/paginas/NuevoPedido'
import Tablero from '@/paginas/tablero/Tablero'
import { rutaInicio } from '@/utiles/rutas'

function PantallaCarga() {
  return (
    <div style={{ height: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Personaje expresion="pensando" tamano={110} />
    </div>
  )
}

/** Deja pasar solo si hay sesion (y, si se pide, el permiso). Si no, lo manda a donde toca. */
function Protegida({ permiso, children }: { permiso?: string; children: React.ReactNode }) {
  const { usuario, puede } = useAuth()
  if (!usuario) return <Navigate to="/entrar" replace />
  if (permiso && !puede(permiso)) return <Navigate to={rutaInicio(usuario)} replace />
  return <>{children}</>
}

export default function App() {
  const { usuario, cargando } = useAuth()
  const ubicacion = useLocation()

  if (cargando) return <PantallaCarga />

  // con clave temporal no se puede hacer nada mas que cambiarla
  if (usuario?.debe_cambiar_password && ubicacion.pathname !== '/cambiar-clave') {
    return <Navigate to="/cambiar-clave" replace />
  }

  return (
    <Routes>
      <Route path="/entrar" element={usuario ? <Navigate to={rutaInicio(usuario)} replace /> : <Login />} />
      <Route path="/cambiar-clave" element={usuario ? <CambiarClave /> : <Navigate to="/entrar" replace />} />
      <Route
        element={
          <Protegida>
            {usuario && (
              <TiempoRealProvider usuarioId={usuario.id}>
                <Shell />
              </TiempoRealProvider>
            )}
          </Protegida>
        }
      >
        <Route path="/tablero" element={<Protegida permiso="pedido.ver"><Tablero /></Protegida>} />
        <Route path="/mis-pedidos" element={<Protegida permiso="pedido.crear"><MisPedidos /></Protegida>} />
        <Route path="/nuevo" element={<Protegida permiso="pedido.crear"><NuevoPedido /></Protegida>} />
        <Route path="/admin/usuarios" element={<Protegida permiso="usuario.administrar"><Equipo /></Protegida>} />
        <Route path="/admin/tablero" element={<Protegida permiso="tablero.configurar"><ConfigTablero /></Protegida>} />
      </Route>
      <Route path="*" element={<Navigate to={usuario ? rutaInicio(usuario) : '/entrar'} replace />} />
    </Routes>
  )
}

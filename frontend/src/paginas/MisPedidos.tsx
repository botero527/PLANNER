// Inicio del comercial: sus pedidos y en que paso va cada uno, sin tener que
// entender el tablero completo.
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { MessageCircle, PackagePlus, Paperclip, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { tablero } from '@/api/endpoints'
import { useAuth } from '@/auth/AuthContext'
import { Personaje } from '@/componentes/personajes/Personaje'
import { TituloBarra } from '@/componentes/TituloBarra'
import { haceCuanto } from '@/utiles/formato'
import './mis-pedidos.css'

function saludo() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export default function MisPedidos() {
  const { usuario } = useAuth()
  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<'activos' | 'listos'>('activos')
  const { data } = useQuery({ queryKey: ['tablero'], queryFn: tablero.ver })

  const mios = useMemo(() => (data?.pedidos ?? []).filter((p) => p.creado_por.id === usuario?.id), [data, usuario])
  const activos = mios.filter((p) => !p.completado_en)
  const listos = mios.filter((p) => p.completado_en)
  const lista = (vista === 'activos' ? activos : listos).filter((p) =>
    `${p.codigo} ${p.marca} ${p.modelo} ${p.mercado}`.toLowerCase().includes(busqueda.toLowerCase()))

  if (!usuario) return null
  const columnas = data?.columnas ?? []

  return (
    <div className="mis">
      <TituloBarra><h1 className="titulo-pagina">Mis pedidos</h1></TituloBarra>

      <section className="mis__hero vidrio borde-prisma">
        <Personaje personaje={usuario.personaje} expresion={activos.length ? 'feliz' : 'guiño'} tamano={130} seguirCursor />
        <div className="mis__hero-texto">
          <p className="sutil">{saludo()},</p>
          <h2>{usuario.nombre.split(' ')[0]} 👋</h2>
          <p>
            {activos.length
              ? <>Tienes <b>{activos.length}</b> pedido(s) en proceso y <b>{listos.length}</b> terminado(s).</>
              : 'No tienes pedidos en proceso. ¿Arrancamos uno?'}
          </p>
        </div>
        <Link to="/nuevo" className="btn btn-primario btn-grande mis__cta">
          <PackagePlus size={20} /> Nuevo pedido
        </Link>
      </section>

      <div className="mis__controles">
        <div className="selector-prioridad mis__vista">
          <button className={vista === 'activos' ? 'activa' : ''} style={{ '--p': 'var(--primario)' } as React.CSSProperties} onClick={() => setVista('activos')}>En proceso ({activos.length})</button>
          <button className={vista === 'listos' ? 'activa' : ''} style={{ '--p': 'var(--exito)' } as React.CSSProperties} onClick={() => setVista('listos')}>Terminados ({listos.length})</button>
        </div>
        <label className="tablero__buscar">
          <Search size={16} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar…" />
        </label>
      </div>

      {lista.length === 0 ? (
        <div className="mis__vacio">
          <Personaje expresion="dormido" tamano={90} />
          <p>{busqueda ? 'Nada con esa búsqueda' : vista === 'activos' ? 'Sin pedidos en proceso' : 'Todavía no hay terminados'}</p>
        </div>
      ) : (
        <ul className="mis__lista">
          {lista.map((p, i) => {
            const indice = columnas.findIndex((c) => c.id === p.columna_id)
            const columna = columnas[indice]
            return (
              <motion.li key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.04 }}>
                <Link to={`/tablero?pedido=${p.id}`} className="mis__item vidrio" style={{ '--c': columna?.color, '--prioridad': `var(--prioridad-${p.prioridad})` } as React.CSSProperties}>
                  <div className="mis__principal">
                    <span className="mono sutil">{p.codigo}</span>
                    <h3>{p.marca} <span>{p.modelo}</span> {p.version_vehiculo && <small>{p.version_vehiculo}</small>}</h3>
                    {!p.aprobado_en && p.codigo_vehiculo_en && !p.numero_pedido && (
                      <span className="mis__accion">⚠ Ya está el código del vehículo: te falta poner el número de pedido</span>
                    )}
                    {!p.aprobado_en && !p.codigo_vehiculo_en && <span className="mis__espera">Esperando que técnica cree el código del vehículo</span>}
                    {!p.aprobado_en && p.numero_pedido && <span className="mis__espera">Esperando aprobación de técnica</span>}
                    <div className="mis__datos">
                      <span className="chip">{p.mercado}</span>
                      {p.tipo_vidrio === '3d' && <span className="chip" style={{ color: 'var(--primario)' }}>3D</span>}
                      <span>{p.total_piezas} pieza(s)</span>
                      {p.total_mensajes > 0 && <span><MessageCircle size={13} /> {p.total_mensajes}</span>}
                      {p.total_adjuntos > 0 && <span><Paperclip size={13} /> {p.total_adjuntos}</span>}
                      <span className="sutil">{haceCuanto(p.creado_en)}</span>
                    </div>
                  </div>
                  <div className="mis__progreso">
                    <span className="mis__estado">{columna?.nombre}</span>
                    <div className="mis__barra">
                      {columnas.map((c, j) => <span key={c.id} className={j <= indice ? 'ok' : ''} style={{ '--c': c.color } as React.CSSProperties} title={c.nombre} />)}
                    </div>
                  </div>
                </Link>
              </motion.li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
